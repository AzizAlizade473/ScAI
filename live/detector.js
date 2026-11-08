// @ts-check
/* ThreatDetector: independent analysis of the conversation as transcribed.
 * - rules.js on every finished caller sentence (instant, deterministic evidence spans)
 * - a separate Gemini classifier (scam-check.js) on the last ~14 lines, debounced and single-flight;
 *   a newer transcript always wins over an older verdict.
 * Its only input is TranscriptLine[]; it never sees the scammer's prompt or state and never talks to it. */
const { EventEmitter } = require('events');
const Rules = require('../rules.js');
const ScamCheck = require('../scam-check.js');

class ThreatDetector extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {string} [o.baseUrl]
   * @param {string} o.model
   * @param {{reports: number, knownContact: boolean, smsCodeArrived: boolean}} o.signals
   */
  constructor(o) {
    super();
    this.o = o;
    /** @type {import('./types').TranscriptLine[]} */
    this.lines = [];
    this.seq = 0;
    this.running = false;
    this.dirty = false;
    /** @type {NodeJS.Timeout | null} */
    this.timer = null;
    this.enabled = true;
    this.closed = false;
  }
  /** @param {import('./types').TranscriptLine} line */
  addLine(line) {
    this.lines.push(line);
    if (!this.enabled) return;
    if (line.who === 'caller') {
      const t0 = process.hrtime.bigint();
      const ra = Rules.analyze(line.text);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const evidence = ra.evidence.filter(e => e.weight > 0).map(e => ({ tactic: e.tactic, quote: e.quote }));
      this.emit('rules', { lineId: line.id, evidence, tactics: ra.tactics, ms: Math.round(ms * 100) / 100 });
      this._schedule();
    }
  }
  /** @param {boolean} on */
  setEnabled(on) { this.enabled = on; if (on && this.lines.some(l => l.who === 'caller')) this._schedule(); }
  /** all caller text so far (for the rules part of the aggregate) */
  callerText() { return this.lines.filter(l => l.who === 'caller').slice(-14).map(l => l.text).join('. '); }

  _schedule() {
    if (!this.o.apiKey || this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this._run(), 300);
  }
  async _run() {
    if (this.closed) return;
    if (this.running) { this.dirty = true; return; }
    this.running = true; this.dirty = false;
    const seq = ++this.seq;
    const upTo = this.lines.length ? this.lines[this.lines.length - 1].id : 0;
    const transcript = this.lines.slice(-14).map(l => ({ who: l.who, text: l.text }));
    this.emit('aiStart', { seq, upToLine: upTo });
    try {
      const result = await ScamCheck.classify({ apiKey: this.o.apiKey, baseUrl: this.o.baseUrl, model: this.o.model, kind: 'call', transcript, signals: this.o.signals, timeoutMs: 9000 });
      if (!this.closed) this.emit('ai', { seq, upToLine: upTo, result, usage: result.usage || null });
    } catch (e) {
      if (!this.closed) this.emit('aiError', { seq, message: /** @type {Error} */ (e).message });
    } finally {
      this.running = false;
      if (this.dirty && !this.closed) this._schedule();
    }
  }
  close() { this.closed = true; if (this.timer) clearTimeout(this.timer); }
}

module.exports = { ThreatDetector };
