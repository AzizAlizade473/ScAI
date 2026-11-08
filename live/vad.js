// @ts-check
/* Energy-based voice activity detection on 16 kHz PCM16 mono.
 * Used on the server for turn timing (latency metrics, silence handling) and for segmenting the user's
 * speech in the turn-based fallback engine. Gemini Live runs its own VAD for turn-taking. */

class EnergyVad {
  /**
   * @param {object} [o]
   * @param {number} [o.rate]       sample rate
   * @param {number} [o.frameMs]
   * @param {number} [o.startMs]    voiced time needed to start speech
   * @param {number} [o.endMs]      silence needed to end speech
   * @param {number} [o.minRms]     absolute floor (0..1)
   */
  constructor(o = {}) {
    this.rate = o.rate || 16000;
    this.frame = Math.round(this.rate * (o.frameMs || 20) / 1000);
    this.startFrames = Math.ceil((o.startMs || 120) / (o.frameMs || 20));
    this.endFrames = Math.ceil((o.endMs || 700) / (o.frameMs || 20));
    this.minRms = o.minRms || 0.015;
    this.noise = 0.004;
    this.speaking = false;
    this.voiced = 0;
    this.silent = 0;
    this.rest = Buffer.alloc(0);
    this.level = 0;
    this.speechMs = 0;
  }
  /**
   * Feed audio; returns speech boundary events in order.
   * @param {Buffer} pcm  little-endian int16
   * @returns {{type: 'start' | 'end', speechMs?: number}[]}
   */
  push(pcm) {
    /** @type {{type: 'start' | 'end', speechMs?: number}[]} */
    const out = [];
    let buf = this.rest.length ? Buffer.concat([this.rest, pcm]) : pcm;
    const bytes = this.frame * 2;
    let off = 0;
    for (; off + bytes <= buf.length; off += bytes) {
      let sum = 0;
      for (let i = off; i < off + bytes; i += 2) { const s = buf.readInt16LE(i) / 32768; sum += s * s; }
      const rms = Math.sqrt(sum / this.frame);
      this.level = rms;
      /* noise floor = minimum tracker: falls at once, rises ~1.6x per second, so steady background
       * noise (fan, street) stops counting as speech after a few seconds while pauses between words keep
       * the floor low during real speech */
      this.noise = rms < this.noise ? rms : Math.min(rms, this.noise * 1.01);
      this.noise = Math.max(this.noise, 0.0005);
      const thr = Math.max(this.minRms, this.noise * 3.5);
      const isVoice = rms > thr;
      if (isVoice) { this.voiced++; this.silent = 0; } else { this.silent++; if (!this.speaking) this.voiced = 0; }
      if (!this.speaking && this.voiced >= this.startFrames) { this.speaking = true; this.speechMs = 0; out.push({ type: 'start' }); }
      if (this.speaking) {
        this.speechMs += 1000 * this.frame / this.rate;
        if (this.silent >= this.endFrames) { this.speaking = false; this.voiced = 0; out.push({ type: 'end', speechMs: Math.round(this.speechMs) }); }
      }
    }
    this.rest = Buffer.from(buf.subarray(off));
    return out;
  }
}

/** PCM16 mono to a WAV container (for speech-to-text). @param {Buffer} pcm @param {number} rate */
function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

module.exports = { EnergyVad, pcmToWav };
