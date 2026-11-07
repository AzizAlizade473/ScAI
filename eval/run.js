// Runs the labelled evaluation set through the real pipeline and writes eval/results.json.
//   node eval/run.js            (rules + Gemini + fusion, paced for free-tier quotas)
//   node eval/run.js --rules    (rules only, no API calls)
// "Scam detected" = level caution or danger (risk >= 0.45). Metrics are computed, never typed in.
const fs = require('fs');
const path = require('path');
const Rules = require('../rules.js');
const ScamCheck = require('../scam-check.js');

const ROOT = path.join(__dirname, '..');
const env = (() => { try { return fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return ''; } })();
const KEY = process.env.GEMINI_API_KEY || ((env.match(/^GEMINI_API_KEY=(.*)$/m) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
const MODEL = process.env.GEMINI_MODEL || ((env.match(/^GEMINI_MODEL=(.*)$/m) || [])[1] || '').trim() || ScamCheck.DEFAULT_MODEL;
const RULES_ONLY = process.argv.includes('--rules') || !KEY;
const PAUSE = +(process.env.EVAL_PAUSE_MS || 4500);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'dataset.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function metrics(rows, pick) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const p = pick(r); if (p == null) continue;
    const pos = p !== 'safe', scam = r.label === 'scam';
    if (pos && scam) tp++; else if (pos) fp++; else if (scam) fn++; else tn++;
  }
  const n = tp + fp + tn + fn, prec = tp + fp ? tp / (tp + fp) : 0, rec = tp + fn ? tp / (tp + fn) : 0;
  const r3 = x => Math.round(x * 1000) / 1000;
  return { n, tp, fp, tn, fn, precision: r3(prec), recall: r3(rec), f1: r3(prec + rec ? 2 * prec * rec / (prec + rec) : 0), accuracy: r3(n ? (tp + tn) / n : 0) };
}
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

(async () => {
  const rows = [];
  for (const it of data.items) {
    const t0 = process.hrtime.bigint();
    const rules = Rules.analyze(it.text);
    const rulesMs = Number(process.hrtime.bigint() - t0) / 1e6;
    let ai = null, err = null;
    if (!RULES_ONLY) {
      for (let attempt = 1; attempt <= 4 && !ai; attempt++) {
        try {
          ai = await ScamCheck.classify(it.kind === 'message'
            ? { apiKey: KEY, model: MODEL, kind: 'message', text: it.text, links: rules.links, signals: {} }
            : { apiKey: KEY, model: MODEL, kind: 'call', transcript: [{ who: 'caller', text: it.text }], signals: { reports: 0, knownContact: false, smsCodeArrived: false } });
        } catch (e) {
          err = e.message;
          const wait = +((e.message.match(/retry in ([\d.]+)s/) || [])[1] || 10);
          if (e.status === 429 || e.transient) await sleep((wait + 1) * 1000); else break;
        }
      }
    }
    const fused = Rules.fuse(rules, ai);
    rows.push({
      id: it.id, lang: it.lang, kind: it.kind, label: it.label, hard: !!it.hard,
      rules: { level: rules.level, risk: rules.risk, tactics: rules.tactics, ms: Math.round(rulesMs * 100) / 100 },
      ai: ai ? { level: ai.level, risk: ai.risk, scamType: ai.scamType, tactics: ai.tactics, model: ai.model, ms: ai.ms } : null,
      aiError: ai ? null : err, fused: { level: fused.level, risk: fused.risk }
    });
    const ok = l => (l === 'safe') === (it.label === 'legit') ? '✓' : '✗';
    console.log(it.id.padEnd(7), it.label.padEnd(5), 'rules', rules.level.padEnd(7), ok(rules.level), ai ? `ai ${ai.level.padEnd(7)} ${ok(ai.level)} ${ai.ms}ms` : 'ai —', 'fused', fused.level, ok(fused.level), err && !ai ? '(' + err.slice(0, 60) + ')' : '');
    if (!RULES_ONLY) await sleep(PAUSE);
  }
  const aiRows = rows.filter(r => r.ai);
  const out = {
    ranAt: new Date().toISOString(), model: RULES_ONLY ? null : MODEL, dataset: { n: rows.length, about: data.about,
      scam: rows.filter(r => r.label === 'scam').length, legit: rows.filter(r => r.label === 'legit').length, hard: rows.filter(r => r.hard).length },
    threshold: 'scam = caution or danger (risk >= 0.45)',
    metrics: {
      rules: metrics(rows, r => r.rules.level),
      ai: aiRows.length ? metrics(aiRows, r => r.ai.level) : null,
      fused: metrics(rows, r => r.fused.level),
      fusedHardOnly: metrics(rows.filter(r => r.hard), r => r.fused.level),
      rulesHardOnly: metrics(rows.filter(r => r.hard), r => r.rules.level)
    },
    byLang: Object.fromEntries(['az', 'ru', 'en'].map(l => [l, metrics(rows.filter(r => r.lang === l), r => r.fused.level)])),
    latency: {
      rulesMsP50: pct(rows.map(r => r.rules.ms), 0.5), rulesMsP95: pct(rows.map(r => r.rules.ms), 0.95),
      aiMsP50: pct(aiRows.map(r => r.ai.ms), 0.5), aiMsP95: pct(aiRows.map(r => r.ai.ms), 0.95), aiCalls: aiRows.length, aiFailures: rows.length - aiRows.length
    },
    rows
  };
  if (RULES_ONLY && fs.existsSync(path.join(__dirname, 'results.json'))) { console.log(JSON.stringify(out.metrics, null, 1)); return; }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 1));
  console.log('\n', JSON.stringify(out.metrics, null, 1), '\n', JSON.stringify(out.latency));
})();
