// @ts-check
/* Turn-based ScammerAgent: the fallback when no Gemini Live model is available.
 * Pipeline per user turn:  VAD segment → speech-to-text → LLM reply (JSON) → text-to-speech → audio.
 * Each stage is timed separately. This is NOT full duplex: the reply starts only after the whole pipeline,
 * and an interruption cancels the reply that is being prepared or played. */
const { EventEmitter } = require('events');
const ScamCheck = require('../scam-check.js');
const Personas = require('./personas');
const { EnergyVad, pcmToWav: wav } = require('./vad');

const REPLY_SCHEMA = {
  type: 'object',
  properties: { say: { type: 'string', description: 'what you say now, Azerbaijani' }, end_call: { type: 'boolean', description: 'true after your goodbye' } },
  required: ['say', 'end_call']
};

class TurnScammer extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {string} [o.baseUrl]
   * @param {import('./types').Persona} o.persona
   */
  constructor(o) {
    super();
    this.mode = 'turn';
    this.opts = { apiKey: o.apiKey, baseUrl: o.baseUrl };
    this.persona = o.persona;
    this.model = 'stt → llm → tts';
    /** @type {{role: string, parts: {text: string}[]}[]} */
    this.history = [];
    this.vad = new EnergyVad({ endMs: 800 });
    /** @type {Buffer[]} */
    this.seg = [];
    /** @type {Buffer[]} */
    this.pre = [];
    this.gen = 0;
    this.busy = false;
    this.closed = false;
  }
  async connect() {
    if (!this.opts.apiKey) throw new Error('GEMINI_API_KEY is not set');
    return { model: this.model, ms: 0 };
  }
  /** @param {Buffer} pcm16k */
  sendAudio(pcm16k) {
    if (this.closed) return;
    const evs = this.vad.push(pcm16k);
    if (this.vad.speaking || evs.length) this.seg.push(pcm16k);
    else { this.pre.push(pcm16k); if (this.pre.length > 4) this.pre.shift(); }
    for (const e of evs) {
      if (e.type === 'start') {
        this.seg = this.pre.concat(this.seg); this.pre = [];
        if (this.busy) { this.gen++; this.busy = false; this.emit('interrupted'); }   /* barge-in cancels the pending reply */
      } else {
        const audio = Buffer.concat(this.seg); this.seg = [];
        if ((e.speechMs || 0) >= 300) this._userTurn(audio);
      }
    }
  }
  /** @param {string} text */
  direct(text) { if (!this.closed) this._reply(text, {}); }

  /** @param {Buffer} audio */
  async _userTurn(audio) {
    const gen = ++this.gen; this.busy = true;
    /** @type {import('./types').StageMetrics} */
    const m = {};
    let text = '';
    try {
      const r = await ScamCheck.transcribe(Object.assign({}, this.opts, { mimeType: 'audio/wav', audioBase64: wav(audio, 16000).toString('base64'), timeoutMs: 12000 }));
      m.sttMs = r.ms; m.sttModel = r.model; text = r.text;
    } catch (e) { if (gen === this.gen) { this.busy = false; this.emit('error', e); } return; }
    if (gen !== this.gen || this.closed) return;
    if (!text) { this.busy = false; return; }
    this.emit('inText', text);
    this._reply(text, m, gen);
  }

  /** @param {string} userText @param {import('./types').StageMetrics} m @param {number} [gen] */
  async _reply(userText, m, gen) {
    if (gen == null) gen = ++this.gen;
    this.busy = true;
    this.history.push({ role: 'user', parts: [{ text: userText }] });
    let say = '', end = false;
    try {
      const r = await ScamCheck.generateJson(Object.assign({}, this.opts, {
        system: Personas.systemPrompt(this.persona) + '\n\nReply with JSON: "say" is exactly what you say now (Azerbaijani, short), "end_call" is true only when this is your goodbye.',
        contents: this.history.slice(-24), schema: REPLY_SCHEMA, timeoutMs: 10000
      }));
      m.llmMs = r.ms; m.llmModel = r.model; say = String(r.data.say || '').trim(); end = !!r.data.end_call;
    } catch (e) { if (gen === this.gen) { this.busy = false; this.emit('error', e); } return; }
    if (gen !== this.gen || this.closed || !say) return;
    this.history.push({ role: 'model', parts: [{ text: say }] });
    this.emit('outText', say);
    try {
      const t = await ScamCheck.speak(Object.assign({}, this.opts, { text: say, voice: this.persona.voice, timeoutMs: 20000 }));
      m.ttsMs = t.ms; m.ttsModel = t.model;
      if (gen !== this.gen || this.closed) return;
      let pcm = Buffer.from(t.data, 'base64');
      if (pcm.subarray(0, 4).toString() === 'RIFF') pcm = pcm.subarray(44);
      for (let i = 0; i < pcm.length; i += 9600) this.emit('audio', pcm.subarray(i, i + 9600));
    } catch (e) {
      m.ttsMs = undefined;
      this.emit('ttsUnavailable', /** @type {Error} */ (e).message);    /* text-only reply, labelled in the app */
    }
    this.emit('metrics', m);
    this.busy = false;
    this.emit('turnComplete');
    if (end) this.emit('endCall', 'goodbye');
  }
  close() { this.closed = true; this.gen++; this.emit('closed', { code: 1000, reason: '', byUs: true }); }
}

module.exports = { TurnScammer };
