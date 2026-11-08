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

  /** @param {string} model */
  _open(model) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(LIVE_URL + '?key=' + encodeURIComponent(this.apiKey));
      ws.binaryType = 'arraybuffer';
      let ready = false;
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error(model + ': setup timed out')); }, this.connectTimeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ setup: this._setup(model) }));
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
        if (this.ws === ws) this.ws = null;
        this.emit('closed', { code: ev.code, reason: ev.reason || '', byUs: this.closedByUs });
      };
      ws.onerror = () => { /* onclose follows with the reason */ };
    });
  }

  /** @param {string} model */
  _setup(model) {
    return {
      model: 'models/' + model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.persona.voice } } },
        temperature: 0.9
      },
      systemInstruction: { parts: [{ text: Personas.systemPrompt(this.persona) }] },
      tools: [END_CALL_TOOL],
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
