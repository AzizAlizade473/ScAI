// @ts-check
/* LiveCallSession: one per WebSocket connection. Orchestrates
 *   client audio → VAD (timing) → ScammerAgent → audio back to the client
 *   ScammerAgent transcripts → TranscriptLine → ThreatDetector → RiskAggregator → UI events
 * Session isolation: every session owns its agent, detector, aggregator, timers and buffers; audio is
 * only held in memory while it is streamed and is never written anywhere.
 *
 * Client → server: binary = PCM16 mono 16 kHz; JSON {type:'start'|'played'|'detector'|'end'|'clientMetric'}
 * Server → client: binary = PCM16 mono 24 kHz (caller voice); JSON events (see send() calls). */
const crypto = require('crypto');
const ScamCheck = require('../scam-check.js');
const Personas = require('./personas');
const { EnergyVad, pcmToWav } = require('./vad');
const { LiveScammer } = require('./scammer-live');
const { TurnScammer } = require('./scammer-turn');
const { ThreatDetector } = require('./detector');
const { RiskAggregator } = require('./risk');

const MAX_SEC = 7 * 60;            /* hard limit per call */
const WRAP_SEC = 6 * 60;           /* ask the caller to say goodbye */
const SILENCE_STEPS = [9000, 18000, 27000, 40000];
const MAX_SESSIONS = 3;
/** @type {Set<LiveCallSession>} */
const active = new Set();

/* Long digit runs (card numbers, codes) never reach the screen; amounts with a currency stay. */
const maskDigits = (/** @type {string} */ s) => String(s).replace(/\d(?:[\d \-]*\d)?/g, m => (m.replace(/\D/g, '').length >= 4 && !/^\d{1,3}( \d{3})+$/.test(m) ? '••••' : m));
const pct = (/** @type {number[]} */ a, /** @type {number} */ p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

class LiveCallSession {
  /**
   * @param {object} o
   * @param {import('./ws').WsConn} o.conn
   * @param {string} o.apiKey
   * @param {string} [o.baseUrl]
   * @param {string} o.detectorModel
   * @param {(s: LiveCallSession) => void} [o.onEnd]
   * @param {((number: string) => Promise<any>) | null} [o.numberRisk]  database answer for the caller's number
   */
  constructor(o) {
    this.o = o;
    this.conn = o.conn;
    this.id = crypto.randomBytes(6).toString('hex');
    this.t0 = Date.now();
    /** @type {import('./types').ScammerAgent | null} */
    this.agent = null;
    /** @type {ThreatDetector | null} */
    this.detector = null;
    this.risk = new RiskAggregator();
    this.vad = new EnergyVad();
    /** @type {import('./types').TranscriptLine[]} */
    this.lines = [];
    this.outBuf = ''; this.inBuf = '';
    /** @type {NodeJS.Timeout | null} */ this.inTimer = null;
    this.turn = 0;
    this.userEndAt = 0; this.lastInAt = 0; this.turnUserEnd = 0;
    this.replyStarted = false;
    this.awaitPlayed = false;
    this.ending = ''; this.ended = false;
    this.silenceIdx = 0;
    /** @type {NodeJS.Timeout | null} */ this.silenceTimer = null;
    /** @type {NodeJS.Timeout[]} */ this.timers = [];
    /** @type {import('./types').TurnMetric[]} */ this.metrics = [];
    /** @type {number[]} */ this.aiMs = [];
    /** @type {number[]} */ this.rulesMs = [];
    /** @type {any[]} */ this.clientMetrics = [];
    /** @type {import('./types').StageMetrics | null} */ this.pendingStages = null;
    /* the user's speech, kept in memory only until it is transcribed (independent speech-to-text) */
    /** @type {Buffer[]} */ this.pre = [];
    /** @type {Buffer[] | null} */ this.utt = null;
    /** @type {Buffer[]} */ this.segs = [];
    /** lines are emitted in order even when the user's transcript is still being produced */
    /** @type {Promise<void>} */ this.lineQueue = Promise.resolve();
    /* token use, as reported by Gemini for this call (for budgeting) */
    this.usage = { live: { turns: 0, promptText: 0, promptAudio: 0, responseAudio: 0, responseText: 0, thoughts: 0 }, stt: { calls: 0, prompt: 0, response: 0 }, detector: { calls: 0, prompt: 0, response: 0 } };
    this.state = 'connecting';
    this.started = false;
    active.add(this);

    this.conn.on('text', s => this._onText(s));
    this.conn.on('binary', b => this._onAudio(b));
    this.conn.on('close', () => this.finish('client_closed', false));
  }

  static canStart() { return active.size < MAX_SESSIONS; }
  static activeCount() { return active.size; }

  now() { return Date.now() - this.t0; }
  /** @param {object} o */
  send(o) { this.conn.sendJson(o); }
  /** @param {string} s */
  setState(s) { if (s !== this.state) { this.state = s; this.send({ type: 'state', state: s, t: this.now() }); } }
  /** @param {string} code @param {string} text */
  notice(code, text) { this.send({ type: 'notice', code, text, t: this.now() }); }

  /** @param {string} s */
  _onText(s) {
    let m;
    try { m = JSON.parse(s); } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'start' && !this.started) this.start(m).catch(e => { this.send({ type: 'error', code: 'start_failed', message: e.message }); this.finish('error'); });
    else if (m.type === 'played') this._played();
    else if (m.type === 'detector' && this.detector) { this.detector.setEnabled(!!m.on); this.send({ type: 'detectorState', on: !!m.on }); }
    else if (m.type === 'clientMetric' && this.clientMetrics.length < 50) this.clientMetrics.push({ turn: m.turn | 0, mouthToEarMs: Math.max(0, Math.min(60000, +m.mouthToEarMs || 0)) });
    else if (m.type === 'end') this.finish('user_hung_up');
  }

  /** @param {any} m */
  async start(m) {
    this.started = true;
    if (m.consent !== true) throw new Error('Microphone consent is required');
    const persona = Personas.byId(String(m.persona || ''));
    if (!persona) throw new Error('Unknown scenario');
    this.persona = persona;
    const want = m.mode === 'turn' ? 'turn' : 'auto';
    /** @type {any} */
    let agent = null, info = null, fellBack = '';
    if (want === 'auto') {
      agent = new LiveScammer({ apiKey: this.o.apiKey, persona, models: m.models, history: () => this.lines.slice(-16).map(l => (l.who === 'you' ? 'Abonent: ' : 'Sən: ') + l.text).join('\n') });
      try { info = await agent.connect(); }
      catch (e) { fellBack = /** @type {Error} */ (e).message; agent = null; }
    }
    if (!agent) {
      agent = new TurnScammer({ apiKey: this.o.apiKey, baseUrl: this.o.baseUrl, persona });
      info = await agent.connect();
    }
    if (this.ended) { agent.close(); return; }
    this.agent = agent;
    /* the caller's number in the scam database (gold layer) is a real signal for the detector */
    let reports = persona.caller.reports, numberRisk = null;
    if (this.o.numberRisk) {
      try { numberRisk = await Promise.race([this.o.numberRisk(persona.caller.number), new Promise(ok => setTimeout(() => ok(null), 1500))]); } catch { numberRisk = null; }
      if (numberRisk && numberRisk.known) reports = Math.max(reports, numberRisk.reports | 0);
    }
    this.detector = new ThreatDetector({ apiKey: this.o.apiKey, baseUrl: this.o.baseUrl, model: this.o.detectorModel, signals: { reports, knownContact: false, smsCodeArrived: false } });
    this._wireAgent(agent);
    this._wireDetector(this.detector);
    this.send({
      type: 'ready', session: this.id, mode: agent.mode, model: info.model, setupMs: info.ms,
      persona: { id: persona.id, title: persona.title, caller: persona.caller, voice: persona.voice },
      audio: { in: 'pcm16/16000', out: 'pcm16/24000' },
      detector: { rules: 'rules.js', model: this.o.detectorModel, independent: true, reports },
      numberRisk: numberRisk && numberRisk.known ? numberRisk : null,
      fallbackReason: fellBack || null, limits: { maxSec: MAX_SEC }, t: this.now()
    });
    if (fellBack) this.notice('fallback_turn', fellBack);
    this.timers.push(setTimeout(() => { if (!this.ending) this.agent && this.agent.direct('[Vaxt bitir. Qısa sağollaş və end_call çağır.]'); }, WRAP_SEC * 1000));
    this.timers.push(setTimeout(() => this.finish('time_limit'), MAX_SEC * 1000));
    this.setState('thinking');
    agent.direct('[ZƏNG QOŞULDU]');
  }

  /** @param {import('./types').ScammerAgent} a */
  _wireAgent(a) {
    a.on('audio', /** @param {Buffer} pcm */ pcm => {
      if (this.ended) return;
      if (!this.replyStarted) {
        this.replyStarted = true; this.turn++;
        /* latency only for a reply to speech: a reply to a silence nudge or the greeting has none */
        const ue = this.userEndAt; this.userEndAt = 0; this.turnUserEnd = ue;
        const replyMs = ue ? Date.now() - ue : null;
        this.metrics.push({ turn: this.turn, replyMs, sttLagMs: null });
        this._scheduleUserLine(500);
        this._clearSilence();
        this.setState('speaking');
        this.send({ type: 'turn', turn: this.turn, replyMs, t: this.now() });
      }
      this.awaitPlayed = true;
      this.conn.sendBinary(pcm);
    });
    a.on('outText', t => { this.outBuf += t; this.send({ type: 'partial', who: 'caller', text: maskDigits(this.outBuf.trim()) }); });
    a.on('inText', t => {
      this.inBuf += t; this.lastInAt = Date.now();
      this.send({ type: 'partial', who: 'you', text: maskDigits(this.inBuf.trim()) });
      if (this.replyStarted) this._scheduleUserLine(500);     /* late fragments still join this user line */
    });
    a.on('interrupted', () => {
      this._finishCallerLine(true);
      this.replyStarted = false;
      this.send({ type: 'interrupted', t: this.now() });
      this.setState('listening');
    });
    a.on('turnComplete', () => {
      if (this.replyStarted || this.outBuf) this._finishCallerLine(false);
      const last = this.metrics[this.metrics.length - 1];
      if (last && this.pendingStages) { last.stages = this.pendingStages; this.pendingStages = null; }
      if (last) this.send({ type: 'metrics', metric: last });
      this.replyStarted = false;
      if (!this.awaitPlayed) this._played();                   /* text-only turn: nothing to wait for */
    });
    a.on('metrics', /** @param {import('./types').StageMetrics} m */ m => { this.pendingStages = m; });
    a.on('usage', /** @param {any} u */ u => {
      const L = this.usage.live; L.turns++;
      for (const d of u.promptTokensDetails || []) { if (d.modality === 'AUDIO') L.promptAudio += d.tokenCount | 0; else L.promptText += d.tokenCount | 0; }
      for (const d of u.responseTokensDetails || []) { if (d.modality === 'AUDIO') L.responseAudio += d.tokenCount | 0; else L.responseText += d.tokenCount | 0; }
      L.thoughts += u.thoughtsTokenCount | 0;
    });
    a.on('ttsUnavailable', msg => this.notice('tts_unavailable', String(msg)));
    a.on('endCall', reason => { this.ending = String(reason || 'goodbye'); this.send({ type: 'callerEnding', reason: this.ending, t: this.now() }); this.timers.push(setTimeout(() => this.finish('caller_hung_up'), 15000)); });
    a.on('error', e => this.notice('agent_error', e.message));
    a.on('reconnecting', info => {
      this.reconnects = (this.reconnects || 0) + 1;
      if (this.replyStarted || this.outBuf) this._finishCallerLine(true);
      this.replyStarted = false;
      this.notice('reconnecting', String(info.code));
      this.setState('connecting');
    });
    a.on('reconnected', r => {
      this.notice('reconnected', `${r.model}${r.resumed ? ' (resumed)' : ' (new session)'} · ${r.ms} ms`);
      this.setState('listening');
      this._armSilence();
    });
    if (process.env.SG_TEST_DROP_MS && a.testDrop) this.timers.push(setTimeout(() => a.testDrop && a.testDrop(), +process.env.SG_TEST_DROP_MS));   /* test only */
    a.on('closed', info => {
      if (this.ended || info.byUs) return;
      this.send({ type: 'error', code: 'upstream_closed', message: info.reason || 'The AI connection closed (' + info.code + ')' });
      this.finish(this.ending ? 'caller_hung_up' : 'network');
    });
  }

  /** @param {ThreatDetector} d */
  _wireDetector(d) {
    d.on('rules', r => {
      this.rulesMs.push(r.ms);
      this.send({ type: 'rules', lineId: r.lineId, evidence: r.evidence, ms: r.ms, t: this.now() });
      this._aggregate();
    });
    d.on('aiStart', r => this.send({ type: 'aiStart', seq: r.seq, upToLine: r.upToLine }));
    d.on('ai', r => {
      this.aiMs.push(r.result.ms);
      if (r.usage) { const D = this.usage.detector; D.calls++; D.prompt += r.usage.promptTokenCount | 0; D.response += (r.usage.candidatesTokenCount | 0) + (r.usage.thoughtsTokenCount | 0); }
      this.risk.setAI(r.result);
      this.send({ type: 'ai', seq: r.seq, upToLine: r.upToLine, result: r.result, t: this.now() });
      this._aggregate();
    });
    d.on('aiError', r => this.send({ type: 'aiError', seq: r.seq, message: r.message, t: this.now() }));
  }

  _aggregate() {
    if (!this.detector) return;
    const { state, changed } = this.risk.update(this.detector.callerText());
    this.send({ type: 'risk', risk: state.risk, level: state.level, tactics: state.tactics, latched: state.latched, changed, t: this.now() });
  }

  /** @param {Buffer} b */
  _onAudio(b) {
    if (!this.agent || this.ended || b.length % 2 || b.length > 64000) return;
    if (this.utt && this.utt.length < 300) this.utt.push(b);
    for (const e of this.vad.push(b)) {
      if (e.type === 'start') { this.utt = this.pre.concat([b]); this.pre = []; this._clearSilence(); this.silenceIdx = 0; this.send({ type: 'vad', speaking: true, t: this.now() }); if (!this.replyStarted) this.setState('listening'); }
      else { if (this.utt) { this.segs.push(Buffer.concat(this.utt)); this.utt = null; } this.userEndAt = Date.now() - this.vad.endFrames * 20; /* last voiced frame, not the end of the hangover */ this.send({ type: 'vad', speaking: false, speechMs: e.speechMs, t: this.now() }); if (!this.replyStarted) this.setState('thinking'); }
    }
    if (!this.utt) { this.pre.push(b); if (this.pre.length > 3) this.pre.shift(); }
    this.agent.sendAudio(b);
  }

  /* the client finished playing the caller's audio */
  _played() {
    this.awaitPlayed = false;
    if (this.ended) return;
    if (this.ending) { this.timers.push(setTimeout(() => this.finish('caller_hung_up'), 600)); return; }
    if (!this.replyStarted) { this.setState('listening'); this._armSilence(); }
  }
  _armSilence() {
    this._clearSilence();
    const step = SILENCE_STEPS[this.silenceIdx];
    if (step == null) return;
    const wait = step - (this.silenceIdx ? SILENCE_STEPS[this.silenceIdx - 1] : 0);
    this.silenceTimer = setTimeout(() => {
      if (this.ended || this.vad.speaking || this.replyStarted) return;
      const n = ++this.silenceIdx;
      const sec = Math.round(step / 1000);
      if (n <= 2) { this.notice('silence', String(sec)); this.agent && this.agent.direct(`[SƏSSİZLİK: abonent ${sec} saniyədir heç nə demir.]`); }
      else if (n === 3) { this.notice('silence', String(sec)); this.agent && this.agent.direct('[Abonent cavab vermir. Qısa sağollaş və end_call çağır.]'); }
      else { this.finish('silence'); return; }
      this._armSilence();
    }, wait);
  }
  _clearSilence() { if (this.silenceTimer) clearTimeout(this.silenceTimer); this.silenceTimer = null; }

  /** @param {number} ms */
  _scheduleUserLine(ms) {
    if (this.inTimer) clearTimeout(this.inTimer);
    this.inTimer = setTimeout(() => this._finishUserLine(), ms);
  }
  /* The user's line. In Live mode the user's speech is transcribed again, independently of the scammer's
   * session, by the speech-to-text model (more accurate for Azerbaijani); if that fails or is slow the Live
   * transcript is used, and the line says which source it came from. */
  _finishUserLine() {
    if (this.inTimer) clearTimeout(this.inTimer);
    this.inTimer = null;
    const liveText = this.inBuf.replace(/\s+/g, ' ').trim();
    this.inBuf = '';
    const segs = this.segs; this.segs = [];
    if (!liveText) return;                                     /* Live heard no words: noise, not speech */
    const m = this.metrics[this.metrics.length - 1];
    const ue = this.turnUserEnd || this.userEndAt;
    if (m && m.sttLagMs == null && ue && this.lastInAt >= ue) m.sttLagMs = this.lastInAt - ue;
    const audio = Buffer.concat(segs);
    const live = !!this.agent && this.agent.mode === 'live';
    const stt = live && audio.length > 16000 * 2 * 0.35 ? this._transcribe(audio) : Promise.resolve(null);
    const liveSource = this.agent ? (live ? this.agent.model + ' (Live ASR)' : 'gemini-3.5-transcribe') : '';
    this.lineQueue = this.lineQueue.then(async () => {
      const r = await stt;
      if (r && r.text) {
        if (m) m.stages = Object.assign({}, m.stages, { sttMs: r.ms, sttModel: r.model });
        this._addLine('you', r.text, false, r.model + ' (STT)');
      } else this._addLine('you', liveText, false, liveSource);
    });
  }
  /** @param {Buffer} pcm16k @returns {Promise<{text: string, model: string, ms: number} | null>} */
  _transcribe(pcm16k) {
    const timeout = new Promise(ok => setTimeout(() => ok(null), 5000));
    const run = ScamCheck.transcribe({ apiKey: this.o.apiKey, baseUrl: this.o.baseUrl, mimeType: 'audio/wav', audioBase64: pcmToWav(pcm16k, 16000).toString('base64'), timeoutMs: 5000 })
      .then(/** @param {any} r */ r => { if (r.usage) { const S = this.usage.stt; S.calls++; S.prompt += r.usage.promptTokenCount | 0; S.response += r.usage.candidatesTokenCount | 0; } return { text: String(r.text || '').trim(), model: r.model, ms: r.ms }; })
      .catch(() => null);
    return Promise.race([run, timeout]).then(/** @param {any} x */ x => x);
  }
  /** @param {boolean} cut */
  _finishCallerLine(cut) {
    if (this.inTimer) this._finishUserLine();                   /* keep the order: the user's line first */
    const text = this.outBuf.replace(/\s+/g, ' ').trim();
    this.outBuf = '';
    if (!text) return;
    const source = this.agent ? (this.agent.mode === 'live' ? this.agent.model + ' (Live ASR)' : 'LLM text') : '';
    this.lineQueue = this.lineQueue.then(() => this._addLine('caller', text, cut, source));
  }
  /** @param {'caller'|'you'} who @param {string} text @param {boolean} cut @param {string} source */
  _addLine(who, text, cut, source) {
    if (!this.conn.open) return;
    /** @type {import('./types').TranscriptLine} */
    const line = { id: this.lines.length + 1, who, text: maskDigits(text), at: this.now(), source, cut };
    this.lines.push(line);
    this.send(Object.assign({ type: 'line' }, line));
    if (this.detector) this.detector.addLine(line);
  }

  summary() {
    const reply = this.metrics.map(m => m.replyMs).filter(/** @returns {v is number} */ v => v != null && v > 0 && v < 30000);
    const stt = this.metrics.map(m => m.sttLagMs).filter(/** @returns {v is number} */ v => v != null);
    const m2e = this.clientMetrics.map(m => m.mouthToEarMs).filter(v => v > 0);
    const st = (/** @type {'sttMs'|'llmMs'|'ttsMs'} */ k) => this.metrics.map(m => m.stages && m.stages[k]).filter(/** @returns {v is number} */ v => typeof v === 'number');
    return {
      mode: this.agent ? this.agent.mode : null, model: this.agent ? this.agent.model : null, detectorModel: this.o.detectorModel,
      turns: this.turn, lines: this.lines.length, durationSec: Math.round(this.now() / 1000),
      replyMsP50: pct(reply, 0.5), replyMsP95: pct(reply, 0.95), sttLagMsP50: pct(stt, 0.5), mouthToEarMsP50: pct(m2e, 0.5),
      sttMsP50: pct(st('sttMs'), 0.5), llmMsP50: pct(st('llmMs'), 0.5), ttsMsP50: pct(st('ttsMs'), 0.5),
      aiMsP50: pct(this.aiMs, 0.5), aiRuns: this.aiMs.length, rulesMsP50: pct(this.rulesMs, 0.5),
      level: this.risk.state.level, risk: this.risk.state.risk, tactics: this.risk.state.tactics,
      usage: this.usage, reconnects: this.reconnects || 0
    };
  }

  /** @param {string} reason @param {boolean} [notify] */
  finish(reason, notify = true) {
    if (this.ended) return;
    this.ended = true;
    this._clearSilence();
    if (this.inTimer) clearTimeout(this.inTimer);
    this._finishCallerLine(false);
    this.timers.forEach(clearTimeout);
    if (this.agent) this.agent.close();
    if (this.detector) this.detector.close();
    active.delete(this);
    if (notify && this.conn.open) {
      this.send({ type: 'end', reason, summary: this.summary(), t: this.now() });
      setTimeout(() => this.conn.close(1000, reason), 200);
    }
    if (this.o.onEnd) this.o.onEnd(this);
  }
}

module.exports = { LiveCallSession, maskDigits, MAX_SESSIONS };
