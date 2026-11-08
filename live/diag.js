// @ts-check
/* Speech diagnostic: a person reads a known sentence; the recording goes through the same streaming
 * speech-to-text as the two-phone call (same model, same language setting), then the same rules + AI check.
 * Returns what was heard, word accuracy against the sentence, and the scam verdict. Audio is not stored. */
const Rules = require('../rules.js');
const ScamCheck = require('../scam-check.js');
const { StreamingStt, STREAM_MODEL, STT_LANGS } = require('./stt-stream');
const { maskDigits } = require('./session');

const SENTENCES = [
  { id: 1, kind: 'scam', text: 'Salam, mən bankın təhlükəsizlik şöbəsindən zəng edirəm. Kartınızın on altı rəqəmini və telefonunuza gələn SMS kodunu deyin.' },
  { id: 2, kind: 'scam', text: 'Bu barədə heç kimə danışmayın, təcili olaraq pulu təhlükəsiz hesaba köçürün.' },
  { id: 3, kind: 'legit', text: 'Salam nənə, axşam sizə gələcəyəm, yolda çörək və süd alım?' }
];

const norm = (/** @type {string} */ s) => String(s).toLocaleLowerCase('az').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** word accuracy = 1 - word error rate (Levenshtein on words), floored at 0 */
function wordAccuracy(/** @type {string} */ ref, /** @type {string} */ hyp) {
  const a = norm(ref), b = norm(hyp);
  if (!a.length) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0)));
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return Math.max(0, 1 - d[a.length][b.length] / a.length);
}

/** @param {Buffer} wav */
function pcmFromWav(wav) {
  if (wav.subarray(0, 4).toString() !== 'RIFF') throw Object.assign(new Error('Send a WAV recording'), { status: 400 });
  let off = 12, rate = 0, ch = 0, bits = 0;
  while (off + 8 <= wav.length) {
    const id = wav.subarray(off, off + 4).toString(), size = wav.readUInt32LE(off + 4);
    if (id === 'fmt ') { ch = wav.readUInt16LE(off + 10); rate = wav.readUInt32LE(off + 12); bits = wav.readUInt16LE(off + 22); }
    if (id === 'data') {
      if (rate !== 16000 || ch !== 1 || bits !== 16) throw Object.assign(new Error('Expected 16 kHz mono 16-bit WAV'), { status: 400 });
      return wav.subarray(off + 8, off + 8 + size);
    }
    off += 8 + size + (size & 1);
  }
  throw Object.assign(new Error('No audio data'), { status: 400 });
}

/** streams the recording (faster than real time) and collects the final transcripts */
async function transcribeStream(/** @type {string} */ apiKey, /** @type {Buffer} */ pcm) {
  const s = new StreamingStt({ apiKey });
  await s.connect();
  const parts = /** @type {string[]} */ ([]);
  let lastEvent = Date.now(), endSeen = false;
  s.on('final', f => { parts.push(f.text); lastEvent = Date.now(); });
  s.on('activity', a => { lastEvent = Date.now(); if (a.type === 'end') endSeen = true; });
  const t0 = Date.now();
  /* real-time pace, exactly like a call: measured 8 Nov 2026, feeding 4x faster made noisy speech come back empty */
  for (let i = 0; i < pcm.length; i += 3200) { s.push(pcm.subarray(i, i + 3200)); await new Promise(r => setTimeout(r, 100)); }
  const silence = Buffer.alloc(3200);
  const sentAt = Date.now();
  while (Date.now() - sentAt < 8000) {                         /* trailing silence until the final transcript has come */
    s.push(silence); await new Promise(r => setTimeout(r, 100));
    if (endSeen && parts.length && Date.now() - lastEvent > 2500) break;
  }
  s.close();
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), ms: Date.now() - sentAt, totalMs: Date.now() - t0 };
}

/**
 * @param {{apiKey: string, baseUrl?: string, model: string}} cfg
 * @param {number} ref sentence id
 * @param {Buffer} wav
 */
async function runDiag(cfg, ref, wav) {
  const s = SENTENCES.find(x => x.id === ref);
  if (!s) throw Object.assign(new Error('Unknown sentence'), { status: 400 });
  const pcm = pcmFromWav(wav);
  if (pcm.length < 16000) throw Object.assign(new Error('Recording is too short'), { status: 400 });
  const stt = await transcribeStream(cfg.apiKey, pcm);
  const heard = maskDigits(stt.text);
  const rules = Rules.analyze(heard);
  let ai = null, aiError = null;
  if (heard) {
    try { ai = await ScamCheck.classify({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model, kind: 'call', transcript: [{ who: 'caller', text: heard }], signals: { reports: 0, knownContact: false, smsCodeArrived: false } }); }
    catch (e) { aiError = /** @type {Error} */ (e).message; }
  }
  const fused = Rules.fuse(rules, ai);
  return {
    sentence: s, heard, accuracy: Math.round(wordAccuracy(s.text, stt.text) * 100) / 100,
    stt: { model: STREAM_MODEL, languages: STT_LANGS, afterSpeechMs: stt.ms, seconds: Math.round(pcm.length / 3200) / 10 },
    verdict: { level: fused.level, risk: fused.risk, tactics: [...new Set(rules.tactics.concat(ai ? ai.tactics : []))], aiModel: ai ? ai.model : null, aiMs: ai ? ai.ms : null, aiError },
    expected: s.kind, correct: s.kind === 'scam' ? fused.level !== 'safe' : fused.level === 'safe'
  };
}

module.exports = { runDiag, SENTENCES, wordAccuracy };
