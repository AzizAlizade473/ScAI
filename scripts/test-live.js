/* End-to-end test of the Live AI scam call against a running server (node server.js).
 * It acts as the phone: streams real recorded Azerbaijani speech (the Lab's victim clips, 16 kHz WAV) as the
 * microphone, in real time, with silence between turns like a live mic; "plays" the caller audio by waiting
 * for its real duration; and records every event the server sends. Nothing is mocked: the server talks to
 * Gemini Live, the detector and the classifier for real.
 *
 *   node scripts/test-live.js [case ...]      cases: talk noise bargein silence turn hangup
 *   SG_URL=ws://localhost:8787/api/live      (default)
 *
 * Results (transcripts, verdicts, latencies) are written to eval/live-results.json. */
const fs = require('fs');
const path = require('path');

const URL_ = process.env.SG_URL || 'ws://localhost:8787/api/live';
const ROOT = path.join(__dirname, '..');
const pcmOf = f => fs.readFileSync(path.join(ROOT, 'audio', f)).subarray(44);
const CHUNK = 3200;                                  /* 100 ms of 16 kHz PCM16 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function withNoise(pcm, level) {                     /* white noise at `level` (0..1 of full scale) */
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i += 2) {
    const v = pcm.readInt16LE(i) + Math.round((Math.random() * 2 - 1) * level * 32767);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i);
  }
  return out;
}
function noiseFrame(level) { return withNoise(Buffer.alloc(CHUNK), level); }

/**
 * One call. `plan` decides what the "user" says after each caller turn.
 * @param {object} o
 * @param {string} o.name
 * @param {string} o.persona
 * @param {string} [o.mode]
 * @param {Buffer[]} [o.replies]           user utterances, one per caller turn
 * @param {number} [o.noise]               background noise level during the whole call
 * @param {boolean} [o.bargeIn]            say the first reply while the caller is still talking
 * @param {number} [o.hangUpAfter]         user hangs up after this many replies
 * @param {string[]} [o.models]
 * @param {number} [o.maxSec]
 */
async function runCall(o) {
  const ev = [], t0 = Date.now(), T = () => Date.now() - t0;
  const res = { name: o.name, persona: o.persona, lines: [], ai: [], risk: [], metrics: [], notices: [], states: [], interrupted: 0, audioBytes: 0, errors: [] };
  const ws = new WebSocket(URL_);
  ws.binaryType = 'arraybuffer';
  let queue = Buffer.alloc(0), playEnd = 0, turnDone = false, ended = null, replyIdx = 0, speakingSince = 0;
  const say = buf => { queue = Buffer.concat([queue, buf]); };
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('cannot connect to ' + URL_)); });
  ws.send(JSON.stringify({ type: 'start', persona: o.persona, consent: true, mode: o.mode || 'auto', models: o.models }));
  const mic = setInterval(() => {                    /* the microphone: always streaming, like a real call */
    if (ws.readyState !== 1) return;
    let f;
    if (queue.length) { f = queue.subarray(0, CHUNK); queue = queue.subarray(CHUNK); if (f.length < CHUNK) f = Buffer.concat([f, Buffer.alloc(CHUNK - f.length)]); if (o.noise) f = withNoise(f, o.noise); }
    else f = noiseFrame(o.noise || 0.002);
    ws.send(f);
  }, 100);
  /* barge-in: talk over the caller ~1.5 s into its first reply while > 2 s of it is still to be played;
   * like the app, stop the local playback at once */
  const barge = o.bargeIn ? setInterval(() => {
    const now = Date.now();
    if (replyIdx === 0 && speakingSince && now - speakingSince > 1500 && playEnd - now > 2000 && !queue.length) {
      replyIdx++; say(o.replies[0]); res.bargeAt = T(); res.bargeLeftMs = Math.round(playEnd - now); playEnd = now;
      console.log(`         BARGE-IN with ${res.bargeLeftMs} ms of caller audio left`);
    }
  }, 100) : null;
  const nextReply = () => {
    if (o.hangUpAfter != null && replyIdx >= o.hangUpAfter) { setTimeout(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'end' })); }, 800); return; }
    const r = (o.replies || [])[replyIdx++];
    if (r) setTimeout(() => say(r), 700);
  };
  ws.onmessage = e => {
    if (typeof e.data !== 'string') {
      const n = e.data.byteLength; res.audioBytes += n;
      const now = Date.now(); if (!speakingSince) speakingSince = now;
      playEnd = Math.max(playEnd, now) + n / 48;        /* 24 kHz PCM16 = 48 bytes per ms */
      return;
    }
    const m = JSON.parse(e.data); ev.push(Object.assign({ at: T() }, m));
    switch (m.type) {
      case 'ready': res.ready = { mode: m.mode, model: m.model, setupMs: m.setupMs, fallbackReason: m.fallbackReason }; break;
      case 'line': res.lines.push({ who: m.who, text: m.text, at: m.at, source: m.source, cut: m.cut }); console.log(`  ${(m.at / 1000).toFixed(1).padStart(5)}s ${m.who === 'caller' ? 'CALLER' : 'USER  '} ${m.cut ? '(cut) ' : ''}${m.text}`); break;
      case 'ai': res.ai.push({ seq: m.seq, level: m.result.level, risk: m.result.risk, scamType: m.result.scamType, tactics: m.result.tactics, model: m.result.model, ms: m.result.ms, upToLine: m.upToLine }); console.log(`         DETECTOR AI ${m.result.level} ${m.result.risk.toFixed(2)} ${m.result.scamType} [${m.result.tactics.join(',')}] ${m.result.model} ${m.result.ms} ms`); break;
      case 'risk': if (m.changed) console.log(`         RISK → ${m.level} (${m.risk})`); res.risk.push({ level: m.level, risk: m.risk, at: m.t }); break;
      case 'metrics': res.metrics.push(m.metric); break;
      case 'state': res.states.push(m.state); if (m.state === 'speaking') { turnDone = false; speakingSince = Date.now(); } break;
      case 'interrupted': res.interrupted++; console.log('         INTERRUPTED (barge-in)'); playEnd = Date.now(); break;
      case 'notice': res.notices.push({ code: m.code, text: m.text, at: m.t }); console.log(`         NOTICE ${m.code} ${m.text}`); break;
      case 'error': res.errors.push(m.message); console.log('         ERROR ' + m.message); break;
      case 'end': ended = m; break;
    }
    if (m.type === 'metrics') turnDone = true;
    if (m.type === 'metrics' || m.type === 'callerEnding') {
      const wait = Math.max(0, playEnd - Date.now());
      setTimeout(() => { if (ws.readyState === 1 && turnDone) { ws.send(JSON.stringify({ type: 'played' })); if (m.type === 'metrics') nextReply(); } }, wait + 150);
    }
  };
  const limit = Date.now() + (o.maxSec || 120) * 1000;
  while (!ended && ws.readyState <= 1 && Date.now() < limit) await sleep(200);
  clearInterval(mic); if (barge) clearInterval(barge);
  if (!ended && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'end' })); await sleep(800); }
  try { ws.close(); } catch { /* */ }
  res.end = ended ? { reason: ended.reason, summary: ended.summary } : { reason: 'test_timeout' };
  console.log(`  → ended: ${res.end.reason}`, ended ? JSON.stringify(ended.summary) : '');
  return res;
}

const CASES = {
  talk: () => runCall({ name: 'multi-turn conversation (bank)', persona: 'bank', replies: [pcmOf('bank/1.wav'), pcmOf('bank/3.wav'), pcmOf('police/3.wav'), pcmOf('invest/5.wav'), pcmOf('bank/5.wav')], hangUpAfter: 5, maxSec: 150 }),
  noise: () => runCall({ name: 'background noise (investment)', persona: 'invest', noise: 0.03, replies: [pcmOf('invest/1.wav'), pcmOf('invest/3.wav'), pcmOf('invest/5.wav')], hangUpAfter: 3, maxSec: 120 }),
  bargein: () => runCall({ name: 'interruption (police)', persona: 'police', bargeIn: true, replies: [pcmOf('police/3.wav'), pcmOf('police/5.wav')], hangUpAfter: 2, maxSec: 90 }),
  silence: () => runCall({ name: 'user stays silent (bank)', persona: 'bank', replies: [], maxSec: 120 }),
  hangup: () => runCall({ name: 'user refuses and the caller ends the call', persona: 'bank', replies: [pcmOf('bank/1.wav'), pcmOf('invest/5.wav'), pcmOf('invest/5.wav'), pcmOf('invest/5.wav')], maxSec: 120 }),
  turn: () => runCall({ name: 'turn-based fallback (STT → LLM → TTS)', persona: 'bank', mode: 'turn', replies: [pcmOf('bank/1.wav'), pcmOf('bank/3.wav')], hangUpAfter: 2, maxSec: 120 }),
  fallback: () => runCall({ name: 'Live model unavailable → automatic fallback', persona: 'bank', models: ['gemini-does-not-exist-live'], replies: [pcmOf('bank/1.wav')], hangUpAfter: 1, maxSec: 90 })
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['talk', 'noise', 'bargein', 'silence'];
  const out = path.join(ROOT, 'eval', 'live-results.json');
  let all = {}; try { all = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* new file */ }
  all.cases = all.cases || {};
  for (const n of names) {
    if (!CASES[n]) { console.log('unknown case ' + n); continue; }
    console.log(`\n== ${n}`);
    try { all.cases[n] = Object.assign({ ranAt: new Date().toISOString() }, await CASES[n]()); }
    catch (e) { console.log('  FAILED: ' + e.message); all.cases[n] = { ranAt: new Date().toISOString(), failed: e.message }; }
  }
  fs.writeFileSync(out, JSON.stringify(all, null, 1));
  console.log('\nwritten ' + path.relative(ROOT, out));
})();
