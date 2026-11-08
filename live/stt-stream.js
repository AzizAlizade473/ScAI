// @ts-check
/* Streaming speech-to-text for one speaker over the Gemini Live API (gemini-3.5-transcribe-live).
 * Audio is streamed as it arrives; Google's VAD marks speech start/end and a final transcript arrives
 * about 1.5 s after the speaker stops (measured). Interim text is ignored: it is often in the wrong language.
 * Events: 'activity' {type: 'start'|'end', offsetMs}, 'final' {text}, 'usage' (usageMetadata), 'closed' {code, reason, byUs}. */
const { EventEmitter } = require('events');

const URL_ = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'gemini-3.5-transcribe-live';
const offsetMs = (/** @type {any} */ s) => Math.round(parseFloat(String(s || '0').replace('s', '')) * 1000) || 0;

class StreamingStt extends EventEmitter {
  /** @param {{apiKey: string, model?: string, timeoutMs?: number}} o */
  constructor(o) {
    super();
    this.apiKey = o.apiKey;
    this.model = o.model || MODEL;
    this.timeoutMs = o.timeoutMs || 8000;
    /** @type {WebSocket | null} */
    this.ws = null;
    this.byUs = false;
    this.sentMs = 0;            /* audio sent so far, in ms: the stream's own clock (audioOffset uses it) */
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(URL_ + '?key=' + encodeURIComponent(this.apiKey));
      ws.binaryType = 'arraybuffer';
      let ready = false;
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error(this.model + ': setup timed out')); }, this.timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/' + this.model, inputAudioTranscription: {} } }));
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(/** @type {ArrayBuffer} */ (ev.data))); } catch { return; }
        if (!ready) { if (m.setupComplete) { ready = true; clearTimeout(timer); this.ws = ws; resolve(undefined); } return; }
        if (m.voiceActivity) this.emit('activity', { type: m.voiceActivity.type === 'ACTIVITY_START' ? 'start' : 'end', offsetMs: offsetMs(m.voiceActivity.audioOffset) });
        const sc = m.serverContent;
        if (sc && sc.inputTranscription && sc.inputTranscription.text) this.emit('final', { text: sc.inputTranscription.text });
        if (m.usageMetadata) this.emit('usage', m.usageMetadata);
      };
      ws.onclose = ev => {
        clearTimeout(timer);
        if (!ready) { reject(new Error(this.model + ': ' + (ev.reason || 'closed ' + ev.code))); return; }
        this.ws = null;
        this.emit('closed', { code: ev.code, reason: ev.reason || '', byUs: this.byUs });
      };
      ws.onerror = () => { /* onclose follows */ };
    });
  }
  /** @param {Buffer} pcm16k */
  push(pcm16k) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: pcm16k.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
    this.sentMs += pcm16k.length / 32;
    return true;
  }
  get ready() { return !!this.ws && this.ws.readyState === 1; }
  close() { this.byUs = true; if (this.ws) { try { this.ws.close(1000); } catch { /* */ } this.ws = null; } }
}

module.exports = { StreamingStt, STREAM_MODEL: MODEL };
