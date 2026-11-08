// @ts-check
/* RiskAggregator: combines the rules and the latest AI verdict with the shared fusion policy
 * (rules.js fuse: hard rule evidence can never be lowered by the AI). Once a call reaches danger it stays
 * there, so a scammer cannot talk the warning away later in the call. */
const Rules = require('../rules.js');

const levelOf = (/** @type {number} */ r) => (r >= 0.8 ? 'danger' : r >= 0.45 ? 'caution' : 'safe');

class RiskAggregator {
  constructor() {
    /** @type {import('./types').RiskState} */
    this.state = { risk: 0.05, level: 'safe', tactics: [], latched: false };
    /** @type {any} */
    this.ai = null;
  }
  /** @param {any} ai */
  setAI(ai) { this.ai = ai; }
  /**
   * @param {string} callerText
   * @returns {{state: import('./types').RiskState, changed: boolean}}
   */
  update(callerText) {
    const rules = Rules.analyze(callerText || '');
    const fused = Rules.fuse(rules, this.ai);
    const prev = this.state;
    let risk = fused.risk;
    if (prev.latched) risk = Math.max(risk, prev.risk);
    const level = /** @type {'safe'|'caution'|'danger'} */ (levelOf(risk));
    const tactics = [...new Set(rules.tactics.concat(this.ai ? this.ai.tactics || [] : []).map(String))];
    this.state = { risk: Math.round(risk * 1000) / 1000, level, tactics, latched: prev.latched || level === 'danger' };
    return { state: this.state, changed: level !== prev.level };
  }
}

module.exports = { RiskAggregator, levelOf };
