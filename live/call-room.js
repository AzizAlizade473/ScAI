// @ts-check
/* Two-phone call: rooms, signalling and independent analysis.
 *
 *  Phone A (caller) ─┐   WebRTC audio, peer to peer on the hotspot (Chromium WebRTC in the app's WebView:
 *                    ├── echo cancellation, noise suppression, gain control)
 *  Phone B (protected)┘
 *        │  WebSocket /api/call: signalling (SDP, ICE), call states
 *        │  binary frames from B only: [tag][PCM16 16 kHz]   tag 1 = the caller's audio exactly as B receives it
 *        ▼                                                    tag 2 = B's own microphone
 *  CallAnalyzer (one per room): VAD per speaker → speech-to-text per segment → lines tagged with speaker,
 *  times and session → ThreatDetector (rules + Gemini) → RiskAggregator → events to B.
 *
 * The caller's phone never sends transcripts, verdicts or analysis audio: the server analyses what the
 * protected person actually hears. Speakers are never mixed: each track has its own VAD and segments. */
const crypto = require('crypto');
const ScamCheck = require('../scam-check.js');
const { EnergyVad, pcmToWav } = require('./vad');
const { ThreatDetector } = require('./detector');
const { RiskAggregator } = require('./risk');
const { maskDigits } = require('./session');
const { StreamingStt, STREAM_MODEL } = require('./stt-stream');

const ROOM_TTL_MS = 30 * 60 * 1000;          /* a room lives 30 minutes */
const REJOIN_MS = 30 * 1000;                 /* a dropped participant may come back within 30 s */
const MAX_ROOMS = 20;
const MAX_CALL_SEC = 15 * 60;
const SEG_MAX_MS = 8000;                     /* long speech is cut into segments of at most 8 s */
const SEG_MIN_MS = 350;
/** @type {Map<string, Room>} */
const rooms = new Map();

/** @typedef {'caller'|'receiver'} Role */
/** @typedef {{ conn: import('./ws').WsConn | null, token: string, name: string, left: number }} Participant */

const newCode = () => { for (;;) { const c = String(crypto.randomInt(1000, 10000)); if (!rooms.has(c)) return c; } };
const newToken = () => crypto.randomBytes(16).toString('hex');
const cleanName = (/** @type {any} */ n) => String(n || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 24);

class CallAnalyzer {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {string} [o.baseUrl]
   * @param {string} o.detectorModel
   * @param {string} o.session
   * @param {(ev: object) => void} o.emit
   */
  constructor(o) {
    this.o = o;
    this.t0 = Date.now();
    this.vad = { caller: new EnergyVad({ endMs: 600 }), you: new EnergyVad({ endMs: 600 }) };
    /** @type {{caller: Buffer[] | null, you: Buffer[] | null}} */
    this.buf = { caller: null, you: null };
    /** @type {{caller: Buffer[], you: Buffer[]}} */
    this.pre = { caller: [], you: [] };
    this.segStart = { caller: 0, you: 0 };
    /** segments in the order they ended; each line is emitted only after all earlier ones (no out-of-order lines) */
    /** @type {any[]} */
    this.queue = [];
    this.seq = 0;
    this.lineId = 0;
    this.lastCallerEnd = 0;
    this.closed = false;
    this.enabled = true;
    this.sttMs = /** @type {number[]} */ ([]);
    this.aiMs = /** @type {number[]} */ ([]);
    this.warnDelays = /** @type {number[]} */ ([]);
    this.usage = { stt: { calls: 0, prompt: 0, response: 0 }, detector: { calls: 0, prompt: 0, response: 0 } };
    this.sttFailures = 0;
    this.risk = new RiskAggregator();
    this.detector = new ThreatDetector({ apiKey: o.apiKey, baseUrl: o.baseUrl, model: o.detectorModel, signals: { reports: 0, knownContact: false, smsCodeArrived: false } });
    this.detector.on('rules', r => { this.o.emit({ type: 'rules', lineId: r.lineId, evidence: r.evidence, ms: r.ms }); this._aggregate(); });
    this.detector.on('aiStart', r => this.o.emit({ type: 'aiStart', seq: r.seq }));
    this.detector.on('ai', r => {
      this.aiMs.push(r.result.ms);
      if (r.usage) { const D = this.usage.detector; D.calls++; D.prompt += r.usage.promptTokenCount | 0; D.response += (r.usage.candidatesTokenCount | 0) + (r.usage.thoughtsTokenCount | 0); }
      this.risk.setAI(r.result);
      this.o.emit({ type: 'ai', seq: r.seq, upToLine: r.upToLine, result: r.result, t: this.now() });
      this._aggregate();
    });
    this.detector.on('aiError', r => this.o.emit({ type: 'aiError', seq: r.seq, message: r.message, t: this.now() }));
    /* streaming speech-to-text, one session per speaker (never mixed); per-segment STT is the fallback */
    /** @type {{caller: import("./stt-stream").StreamingStt | null, you: import("./stt-stream").StreamingStt | null}} */
    this.stream = { caller: null, you: null };
    /** @type {{caller: string, you: string}} */
    this.mode = { caller: 'batch', you: 'batch' };
    /** @type {{caller: Buffer[], you: Buffer[]}} */
    this.sbuf = { caller: [], you: [] };
    /** @type {{caller: any, you: any}} */
    this.cur = { caller: null, you: null };
    this.streamWall = { caller: 0, you: 0 };
    this.restarts = { caller: 0, you: 0 };
    /** wall time of each speaker's last voiced audio (server energy VAD): latency is measured from here */
    this.lastVoice = { caller: 0, you: 0 };
    this._startStream('caller'); this._startStream('you');
  }
  now() { return Date.now() - this.t0; }

  /** @param {'caller'|'you'} who */
  _startStream(who) {
    if (this.closed) return;
    this.mode[who] = 'connecting';
    const s = new StreamingStt({ apiKey: this.o.apiKey });
    s.connect().then(() => {
      if (this.closed) { s.close(); return; }
      this.stream[who] = s; this.mode[who] = 'stream'; this.streamWall[who] = 0;
      s.on('activity', a => this._activity(who, a));
      s.on('final', f => this._final(who, f.text));
      s.on('usage', u => { const S = this.usage.stt; S.prompt += u.promptTokenCount | 0; S.response += u.responseTokenCount | 0; });
      s.on('closed', info => {
        if (this.closed || info.byUs || this.stream[who] !== s) return;
        this.stream[who] = null;
        const it = this.cur[who]; if (it) this._finish(it);
        this.cur[who] = null;
        if (++this.restarts[who] <= 3) this._startStream(who);
        else { this.mode[who] = 'batch'; this.o.emit({ type: 'notice', code: 'stt_stream_unavailable', text: info.reason || String(info.code) }); }
      });
      for (const b of this.sbuf[who].splice(0)) this._streamPush(who, b);
    }).catch(/** @param {Error} e */ e => {
      if (this.closed) return;
      this.mode[who] = 'batch';                                   /* quota or outage: per-segment STT instead */
      this.sbuf[who] = [];
      this.o.emit({ type: 'notice', code: 'stt_stream_unavailable', text: e.message });
    });
  }
  /** @param {'caller'|'you'} who @param {Buffer} pcm */
  _streamPush(who, pcm) {
    const s = this.stream[who];
    if (!s) return;
    if (!this.streamWall[who]) this.streamWall[who] = Date.now() - this.t0;   /* call time of the stream's offset 0 */
    s.push(pcm);
  }
  /** @param {'caller'|'you'} who @param {number} off */
  _callTime(who, off) { return this.streamWall[who] + off; }
  /** @param {'caller'|'you'} who @param {{type: string, offsetMs: number}} a */
  _activity(who, a) {
    if (a.type === 'start') {
      const item = { seq: ++this.seq, who, t0: this._callTime(who, a.offsetMs), t1: 0, done: false, line: null, text: '', ended: false, finalAt: 0, timer: /** @type {any} */ (null) };
      this.queue.push(item); this.cur[who] = item;
      this.o.emit({ type: 'vad', who, speaking: true });
    } else {
      const item = this.cur[who]; this.cur[who] = null;
      this.o.emit({ type: 'vad', who, speaking: false });
      if (!item) return;
      item.t1 = this._callTime(who, a.offsetMs); item.ended = true;
      if (item.text) this._finish(item);
      else item.timer = setTimeout(() => this._finish(item), 2500);   /* the final transcript usually comes ~1.5 s after the end */
    }
  }
  /** @param {'caller'|'you'} who @param {string} text */
  _final(who, text) {
    let item = this.cur[who] || [...this.queue].reverse().find(x => x.who === who && !x.done && x.ended);
    if (!item) { item = { seq: ++this.seq, who, t0: Math.max(0, this.now() - 2000), t1: 0, done: false, line: null, text: '', ended: true, finalAt: 0, timer: null }; this.queue.push(item); }
    item.text = (item.text ? item.text + ' ' : '') + text; item.finalAt = Date.now();
    if (item.ended) this._finish(item);
  }
  /** @param {any} item */
  _finish(item) {
    if (item.done) return;
    clearTimeout(item.timer);
    if (!item.t1) item.t1 = this.now();
    const text = String(item.text || '').replace(/\s+/g, ' ').trim();
    if (text && this.enabled) {
      const fin = item.finalAt || Date.now(), lv = this.lastVoice[/** @type {'caller'|'you'} */ (item.who)];
      item.endWall = lv && lv <= fin && lv >= this.t0 + item.t0 ? lv : this.t0 + item.t1;   /* when the speaker really stopped */
      const sttMs = Math.max(0, fin - item.endWall);
      this.sttMs.push(sttMs); this.usage.stt.calls++;
      item.line = { who: item.who, text: maskDigits(text), t0: item.t0, t1: item.t1, sttMs, model: STREAM_MODEL };
    }
    item.done = true;
    this._flush();
  }

  /** @param {'caller'|'you'} who @param {Buffer} pcm */
  push(who, pcm) {
    if (this.closed || !this.enabled || pcm.length % 2 || pcm.length > 64000) return;
    if (this.mode[who] === 'stream') {
      for (const e of this.vad[who].push(pcm)) if (e.type === 'end') this.lastVoice[who] = Date.now() - this.vad[who].endFrames * 20;
      this._streamPush(who, pcm); return;
    }
    if (this.mode[who] === 'connecting') { const q = this.sbuf[who]; q.push(pcm); if (q.length > 40) q.shift(); return; }
    const b = this.buf[who];
    if (b) b.push(pcm);
    for (const e of this.vad[who].push(pcm)) {
      if (e.type === 'start') { this.buf[who] = this.pre[who].concat([pcm]); this.pre[who] = []; this.segStart[who] = this.now() - 300; this.o.emit({ type: 'vad', who, speaking: true }); }
      else { this._endSegment(who, e.speechMs || 0); this.o.emit({ type: 'vad', who, speaking: false }); }
    }
    const cur = this.buf[who];
    if (!cur) { this.pre[who].push(pcm); if (this.pre[who].length > 3) this.pre[who].shift(); }
    else if (this.now() - this.segStart[who] > SEG_MAX_MS) this._endSegment(who, SEG_MAX_MS, true);
  }

  /** @param {'caller'|'you'} who @param {number} speechMs @param {boolean} [forced] */
  _endSegment(who, speechMs, forced) {
    const b = this.buf[who]; this.buf[who] = forced ? [] : null;
    if (forced) this.segStart[who] = this.now();
    if (!b || !this.enabled || speechMs < SEG_MIN_MS) return;
    const audio = Buffer.concat(b);
    const t1 = this.now();
    /** @type {{seq: number, who: "caller"|"you", t0: number, t1: number, done: boolean, line: any}} */
    const item = { seq: ++this.seq, who, t0: Math.max(0, t1 - Math.round(audio.length / 32)), t1, done: false, line: null };
    this.queue.push(item);
    const started = Date.now();
    ScamCheck.transcribe({ apiKey: this.o.apiKey, baseUrl: this.o.baseUrl, mimeType: 'audio/wav', audioBase64: pcmToWav(audio, 16000).toString('base64'), timeoutMs: 8000 })
      .then(/** @param {any} r */ r => {
        if (r.usage) { const S = this.usage.stt; S.calls++; S.prompt += r.usage.promptTokenCount | 0; S.response += r.usage.candidatesTokenCount | 0; }
        const text = String(r.text || '').replace(/\s+/g, ' ').trim();
        const sttMs = Date.now() - started; this.sttMs.push(sttMs);
        if (text) item.line = { who, text: maskDigits(text), t0: item.t0, t1: item.t1, sttMs, model: r.model };
      })
      .catch(/** @param {Error} e */ e => {
        if (++this.sttFailures === 1 || this.sttFailures % 5 === 0) this.o.emit({ type: 'notice', code: 'stt_unavailable', text: e.message });
      })
      .finally(() => { item.done = true; this._flush(); });
  }

  _flush() {
    while (this.queue.length && this.queue[0].done) {
      const it = /** @type {any} */ (this.queue.shift());
      if (!it.line || this.closed) continue;
      const line = Object.assign({ id: ++this.lineId, at: it.t1, source: it.line.model + (it.line.model === STREAM_MODEL ? ' (stream)' : ' (STT)'), cut: false }, it.line);
      this.o.emit(Object.assign({ type: 'line' }, line));
      if (line.who === 'caller') this.lastCallerEnd = it.endWall || this.t0 + it.t1;   /* wall time when the caller stopped saying these words */
      this.detector.addLine({ id: line.id, who: line.who, text: line.text, at: line.at, source: line.source });
    }
  }

  _aggregate() {
    const prev = this.risk.state.level;
    const { state, changed } = this.risk.update(this.detector.callerText());
    let warnMs = null;
    if (changed && state.level !== 'safe' && state.level !== prev && this.lastCallerEnd) { warnMs = Date.now() - this.lastCallerEnd; this.warnDelays.push(warnMs); }
    this.o.emit({ type: 'risk', risk: state.risk, level: state.level, tactics: state.tactics, latched: state.latched, changed, warnMs, t: this.now() });
  }

  /** @param {boolean} on */
  setEnabled(on) { this.enabled = on; this.detector.setEnabled(on); }

  summary() {
    const p50 = (/** @type {number[]} */ a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    return { lines: this.lineId, stt: { caller: this.mode.caller, you: this.mode.you }, sttMsP50: p50(this.sttMs), aiMsP50: p50(this.aiMs), warnMs: this.warnDelays[0] == null ? null : this.warnDelays[0], level: this.risk.state.level, risk: this.risk.state.risk, tactics: this.risk.state.tactics, usage: this.usage, detectorModel: this.o.detectorModel };
  }
  close() {
    this.closed = true; this.detector.close();
    for (const w of /** @type {('caller'|'you')[]} */ (['caller', 'you'])) { const s = this.stream[w]; if (s) s.close(); this.stream[w] = null; }
    for (const it of this.queue) clearTimeout(it.timer);
  }
}

class Room {
  /** @param {{apiKey: string, baseUrl?: string, detectorModel: string, log?: (s: string) => void}} cfg */
  constructor(cfg) {
    this.cfg = cfg;
    this.code = newCode();
    this.session = crypto.randomBytes(6).toString('hex');
    this.created = Date.now();
    /** @type {{caller: Participant | null, receiver: Participant | null}} */
    this.p = { caller: null, receiver: null };
    this.state = 'waiting';              /* waiting → ringing → active → ended */
    /** @type {CallAnalyzer | null} */
    this.analyzer = null;
    this.acceptedAt = 0;
    /** @type {{caller?: number, receiver?: number}} */
    this.connectedAt = {};
    this.timer = setTimeout(() => this.end('expired'), ROOM_TTL_MS);
    rooms.set(this.code, this);
  }
  /** @param {Role} role @param {object} msg */
  send(role, msg) { const x = this.p[role]; if (x && x.conn && x.conn.open) x.conn.sendJson(msg); }
  /** @param {Role} role */
  other(role) { return role === 'caller' ? 'receiver' : 'caller'; }

  startCall() {
    this.state = 'active';
    this.acceptedAt = Date.now();
    this.analyzer = new CallAnalyzer({ apiKey: this.cfg.apiKey, baseUrl: this.cfg.baseUrl, detectorModel: this.cfg.detectorModel, session: this.session, emit: ev => this.send('receiver', Object.assign({ session: this.session }, ev)) });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.end('time_limit'), MAX_CALL_SEC * 1000);
  }
  /** @param {string} reason @param {Role} [by] */
  end(reason, by) {
    if (this.state === 'ended') return;
    const was = this.state;
    this.state = 'ended';
    clearTimeout(this.timer);
    const summary = this.analyzer ? this.analyzer.summary() : null;
    if (this.analyzer) this.analyzer.close();
    const connectMs = this.connectedAt.receiver && this.acceptedAt ? this.connectedAt.receiver - this.acceptedAt : null;
    for (const r of /** @type {Role[]} */ (['caller', 'receiver'])) this.send(r, { type: 'ended', reason, by: by || null, summary: r === 'receiver' ? summary : null, connectMs });
    rooms.delete(this.code);
    if (this.cfg.log && was !== 'waiting') {
      const s = summary;
      this.cfg.log(`[call] ${this.code}/${this.session} ended (${reason}) · connect ${connectMs} ms` + (s ? ` · ${s.lines} lines · STT p50 ${s.sttMsP50} ms · AI p50 ${s.aiMsP50} ms · first warning ${s.warnMs} ms after the caller's words · ${s.level} · tokens STT ${s.usage.stt.prompt}/${s.usage.stt.response} detector ${s.usage.detector.prompt}/${s.usage.detector.response}` : ''));
    }
  }
}

/**
 * One WebSocket connection of a phone. It becomes the caller (create) or the receiver (join, by code).
 * @param {import('./ws').WsConn} conn
 * @param {{apiKey: string, baseUrl?: string, detectorModel: string, log?: (s: string) => void}} cfg
 */
function handleCallConnection(conn, cfg) {
  /** @type {Room | null} */ let room = null;
  /** @type {Role | null} */ let role = null;
  const reply = (/** @type {object} */ m) => conn.sendJson(m);
  const fail = (/** @type {string} */ code, /** @type {string} */ message) => reply({ type: 'error', code, message });

  conn.on('text', s => {
    let m; try { m = JSON.parse(s); } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'create') {
      if (room) return;
      if (m.consent !== true) return fail('consent', 'Consent to live transcription is required');
      if (rooms.size >= MAX_ROOMS) return fail('busy', 'Too many rooms');
      room = new Room(cfg); role = 'caller';
      room.p.caller = { conn, token: newToken(), name: cleanName(m.name) || 'A', left: 0 };
      return reply({ type: 'created', code: room.code, token: room.p.caller.token, role, session: room.session, expiresAt: room.created + ROOM_TTL_MS });
    }
    if (m.type === 'join') {
      if (room) return;
      const r = rooms.get(String(m.code || '').replace(/\D/g, ''));
      if (!r || r.state === 'ended') return fail('no_room', 'No call with this code');
      if (r.p.receiver) return fail('full', 'This call already has two phones');
      if (m.consent !== true) return fail('consent', 'Consent to live transcription is required');
      room = r; role = 'receiver';
      r.p.receiver = { conn, token: newToken(), name: cleanName(m.name) || 'B', left: 0 };
      reply({ type: 'joined', code: r.code, token: r.p.receiver.token, role, session: r.session, peer: r.p.caller ? r.p.caller.name : '' });
      return r.send('caller', { type: 'peer', name: r.p.receiver.name });
    }
    if (m.type === 'rejoin') {                                   /* the same phone after a dropped connection */
      if (room) return;
      const r = rooms.get(String(m.code || '')), want = m.role === 'receiver' ? 'receiver' : 'caller';
      const x = r && r.p[want];
      if (!r || !x || x.token !== String(m.token || '') || r.state === 'ended') return fail('no_room', 'This call has ended');
      room = r; role = want; x.conn = conn; x.left = 0;
      reply({ type: 'rejoined', code: r.code, role, state: r.state, session: r.session });
      return r.send(r.other(want), { type: 'peerBack' });
    }
    if (!room || !role) return;
    const r = room, me = role, them = r.other(me);
    switch (m.type) {
      case 'ring':
        if (me !== 'caller' || r.state !== 'waiting' || !r.p.receiver) return;
        r.state = 'ringing';
        return r.send('receiver', { type: 'incoming', from: r.p.caller ? r.p.caller.name : 'A' });
      case 'accept':
        if (me !== 'receiver' || r.state !== 'ringing') return;
        r.startCall();
        r.send('caller', { type: 'accepted' }); return reply({ type: 'accepted' });
      case 'decline':
        if (r.state === 'ringing') { r.state = 'waiting'; r.send(them, { type: 'declined' }); }
        return;
      case 'signal':                                              /* SDP / ICE, relayed as-is to the other phone */
        if (r.state !== 'active' || !m.data || JSON.stringify(m.data).length > 20000) return;
        return r.send(them, { type: 'signal', data: m.data });
      case 'rtc':                                                 /* WebRTC connection state, for timing only */
        if (m.state === 'connected' && !r.connectedAt[me]) {
          r.connectedAt[me] = Date.now();
          if (me === 'receiver' && r.acceptedAt) reply({ type: 'connectTime', ms: r.connectedAt[me] - r.acceptedAt });
        }
        return;
      case 'detector':
        if (me === 'receiver' && r.analyzer) r.analyzer.setEnabled(!!m.on);
        return;
      case 'hangup':
        return r.end('hangup', me);
    }
  });
  conn.on('binary', b => {
    if (!room || role !== 'receiver' || !room.analyzer || room.state !== 'active' || b.length < 3) return;
    const tag = b[0];
    if (tag === 1) room.analyzer.push('caller', b.subarray(1));
    else if (tag === 2) room.analyzer.push('you', b.subarray(1));
  });
  conn.on('close', () => {
    if (!room || !role) return;
    const r = room, me = role, x = r.p[me];
    if (!x || x.conn !== conn) return;
    x.conn = null; x.left = Date.now();
    if (r.state === 'waiting' && me === 'receiver') { r.p.receiver = null; r.send('caller', { type: 'peerLeft' }); return; }
    if (r.state === 'waiting' && me === 'caller') { r.end('caller_left'); return; }
    r.send(r.other(me), { type: 'peerAway' });
    setTimeout(() => { if (x.conn === null && x.left && r.state !== 'ended') r.end('connection_lost', me); }, REJOIN_MS);
  });
}

const roomCount = () => rooms.size;
module.exports = { handleCallConnection, roomCount, CallAnalyzer };
