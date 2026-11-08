// @ts-check
/* ScammerAgent on the Gemini Live API (bidirectional WebSocket, native audio).
 * One model does speech understanding, reasoning and speech output, so a reply starts about a second after
 * the user stops talking. Gemini's server-side VAD handles turn-taking and barge-in (the user can interrupt).
 * Transcripts come from the Live API's speech-to-text of the input audio and of the generated audio. */
const { EventEmitter } = require('events');
const Personas = require('./personas');

const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const LIVE_MODELS = ['gemini-3.8-live', 'gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest'];

const END_CALL_TOOL = {
  functionDeclarations: [{
    name: 'end_call',
    description: 'Hang up the phone call. Call it only after you have spoken a short goodbye.',
    parameters: { type: 'OBJECT', properties: { reason: { type: 'STRING', description: 'why the call ends' } }, required: ['reason'] }
  }]
};

/** model cooldowns after quota / availability errors (shared by sessions, like ScamCheck's) */
/** @type {Map<string, number>} */
const cooldown = new Map();

class LiveScammer extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {import('./types').Persona} o.persona
   * @param {string[]} [o.models]
   * @param {number} [o.connectTimeoutMs]
   * @param {() => string} [o.history]   transcript so far, used only if a dropped session cannot be resumed
   */
  constructor(o) {
    super();
    this.mode = 'live';
    this.apiKey = o.apiKey;
    this.persona = o.persona;
    this.models = o.models && o.models.length ? o.models : LIVE_MODELS;
    this.connectTimeoutMs = o.connectTimeoutMs || 8000;
    this.model = '';
    /** @type {WebSocket | null} */
    this.ws = null;
    this.closedByUs = false;
    this.history = o.history || (() => '');
    /** latest session-resumption handle: lets a dropped connection continue the same conversation */
    this.handle = '';
    this.recovering = false;
  }

  /** Tries each Live model until one completes setup. */
  async connect() {
    const now = Date.now();
    const order = this.models.filter(m => !((cooldown.get(m) || 0) > now));
    let lastErr = new Error('No Live model available');
    for (const m of (order.length ? order : this.models)) {
      const t0 = Date.now();
      try {
        await this._open(m);
        this.model = m;
        return { model: m, ms: Date.now() - t0 };
      } catch (e) {
        lastErr = /** @type {Error} */ (e);
        const msg = String(lastErr.message);
        const w = msg.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/);
        const wait = w ? ((+w[1] || 0) * 3600 + (+w[2] || 0) * 60 + (+w[3] || 0)) * 1000 : 0;
        cooldown.set(m, Date.now() + Math.max(/quota|exhausted|429|not found|not supported/i.test(msg) ? 600000 : 60000, wait));
      }
    }
    throw lastErr;
  }

  /** @param {string} model @param {string} [handle] */
  _open(model, handle) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(LIVE_URL + '?key=' + encodeURIComponent(this.apiKey));
      ws.binaryType = 'arraybuffer';
      let ready = false;
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error(model + ': setup timed out')); }, this.connectTimeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ setup: this._setup(model, handle) }));
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(/** @type {ArrayBuffer} */ (ev.data))); } catch { return; }
        if (!ready) {
          if (m.setupComplete) { ready = true; clearTimeout(timer); this.ws = ws; resolve(undefined); }
          return;
        }
        this._onMessage(m);
      };
      ws.onclose = ev => {
        clearTimeout(timer);
        if (!ready) { reject(new Error(model + ': ' + (ev.reason || 'closed ' + ev.code))); return; }
        if (this.ws === ws) this.ws = null; else return;   /* an old socket after a reconnect */
        if (this.closedByUs) { this.emit('closed', { code: ev.code, reason: ev.reason || '', byUs: true }); return; }
        this._recover({ code: ev.code, reason: ev.reason || '' });
      };
      ws.onerror = () => { /* onclose follows with the reason */ };
    });
  }

  /* An unexpected drop (network, 1006, goAway): reconnect without ending the call.
   * 1. the same model with the resumption handle, so the conversation keeps its memory (2 tries);
   * 2. otherwise any Live model, primed with the transcript so far as a stage direction. */
  /** @param {{code: number, reason: string}} info */
  async _recover(info) {
    if (this.recovering) return;
    this.recovering = true;
    this.emit('reconnecting', info);
    const t0 = Date.now();
    try {
      if (this.handle) {
        for (let i = 0; i < 2 && !this.closedByUs; i++) {
          try { await this._open(this.model, this.handle); this.emit('reconnected', { model: this.model, resumed: true, ms: Date.now() - t0 }); return; }
          catch { await new Promise(r => setTimeout(r, 400)); }
        }
      }
      if (this.closedByUs) return;
      const prev = this.model;
      await this.connect();
      const h = this.history();
      this.direct('[Əlaqə qısa kəsildi və bərpa olundu. Bu, eyni zəngdir; yenidən salamlaşma. İndiyə qədərki danışıq:\n' + h + '\nDanışığı qaldığın yerdən davam et.]');
      this.emit('reconnected', { model: this.model, resumed: false, from: prev, ms: Date.now() - t0 });
    } catch (e) {
      this.emit('closed', { code: info.code, reason: info.reason || /** @type {Error} */ (e).message, byUs: false });
    } finally { this.recovering = false; }
  }

  /** test only: drop the upstream connection as the network would */
  testDrop() { if (this.ws) this.ws.close(4000, 'test drop'); }

  /** @param {string} model @param {string} [handle] */
  _setup(model, handle) {
    return {
      model: 'models/' + model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.persona.voice } } },
        temperature: 0.9
      },
      systemInstruction: { parts: [{ text: Personas.systemPrompt(this.persona) }] },
      tools: [END_CALL_TOOL],
      sessionResumption: handle ? { handle } : {},
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: { prefixPaddingMs: 200, silenceDurationMs: 700 },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
      }
    };
  }

  /** @param {any} m */
  _onMessage(m) {
    const sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) this.emit('interrupted');
      for (const p of (sc.modelTurn && sc.modelTurn.parts) || []) {
        if (p.inlineData && p.inlineData.data) this.emit('audio', Buffer.from(p.inlineData.data, 'base64'));
      }
      if (sc.inputTranscription && sc.inputTranscription.text) this.emit('inText', sc.inputTranscription.text);
      if (sc.outputTranscription && sc.outputTranscription.text) this.emit('outText', sc.outputTranscription.text);
      if (sc.turnComplete) this.emit('turnComplete');
    }
    if (m.toolCall) {
      for (const f of m.toolCall.functionCalls || []) {
        /* No tool response is sent: answering it makes the model speak again ("the call has ended").
         * The session hangs up once the goodbye has been played. */
        if (f.name === 'end_call') this.emit('endCall', String((f.args && f.args.reason) || ''));
      }
    }
    if (m.sessionResumptionUpdate && m.sessionResumptionUpdate.resumable && m.sessionResumptionUpdate.newHandle) this.handle = m.sessionResumptionUpdate.newHandle;
    if (m.usageMetadata) this.emit('usage', m.usageMetadata);   /* per turn: the whole context is billed again as prompt */
    if (m.goAway) this.emit('error', new Error('Live session ending soon (' + (m.goAway.timeLeft || '?') + ')'));
  }

  /** @param {Buffer} pcm16k */
  sendAudio(pcm16k) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: pcm16k.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
  }
  /** @param {string} text */
  direct(text) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ realtimeInput: { text } }));
  }
  close() {
    this.closedByUs = true;
    if (this.ws) { try { this.ws.close(1000); } catch { /* */ } this.ws = null; }
  }
}

const liveStatus = () => Object.fromEntries([...cooldown].filter(([, t]) => t > Date.now()).map(([m, t]) => [m, new Date(t).toISOString()]));

module.exports = { LiveScammer, LIVE_MODELS, liveStatus };
