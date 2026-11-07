// Generates the Simulation Lab voices with Gemini text-to-speech.
//   node scripts/gen-voices.js          (skips clips that already exist)
//   node scripts/gen-voices.js --force  (regenerates everything)
// Output: audio/<scenario>/<line>.wav and audio/alert/<lang>.wav — 16 kHz mono WAV.
const fs = require('fs');
const path = require('path');
const ScamCheck = require('../scam-check.js');
const S = require('../scenarios.js');

const ROOT = path.join(__dirname, '..');
const env = (() => { try { return fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return ''; } })();
const KEY = process.env.GEMINI_API_KEY || ((env.match(/^GEMINI_API_KEY=(.*)$/m) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }
const FORCE = process.argv.includes('--force');
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
/* Free-tier text-to-speech allows ~3 requests per minute per model: go slowly by default. */
const WORKERS = +(process.env.TTS_WORKERS || 2), PAUSE = +(process.env.TTS_PAUSE_MS || 10000);

/* WAV (any rate, 16-bit mono) or raw PCM → 16 kHz 16-bit mono WAV */
function pcmOf(buf, mime) {
  if (buf.slice(0, 4).toString() === 'RIFF') {
    let o = 12, rate = 24000, data = null;
    while (o + 8 <= buf.length) {
      const id = buf.slice(o, o + 4).toString(), size = buf.readUInt32LE(o + 4);
      if (id === 'fmt ') rate = buf.readUInt32LE(o + 12);
      if (id === 'data') { data = buf.slice(o + 8, o + 8 + size); break; }
      o += 8 + size + (size & 1);
    }
    if (data && data.slice(0, 4).toString() === 'RIFF') return pcmOf(data, mime); /* nested header seen in some responses */
    return { pcm: data, rate };
  }
  return { pcm: buf, rate: +((String(mime).match(/rate=(\d+)/) || [])[1] || 24000) };
}
function to16k({ pcm, rate }) {
  const n = Math.floor(pcm.length / 2), outN = Math.floor(n * 16000 / rate), out = Buffer.alloc(outN * 2);
  for (let i = 0; i < outN; i++) {
    const x = i * rate / 16000, j = Math.floor(x), f = x - j;
    const a = pcm.readInt16LE(Math.min(j, n - 1) * 2), b = pcm.readInt16LE(Math.min(j + 1, n - 1) * 2);
    out.writeInt16LE(Math.round(a + (b - a) * f), i * 2);
  }
  /* trim leading/trailing near-silence, keep 120 ms padding */
  let s = 0, e = outN - 1; const thr = 300;
  while (s < outN && Math.abs(out.readInt16LE(s * 2)) < thr) s++;
  while (e > s && Math.abs(out.readInt16LE(e * 2)) < thr) e--;
  s = Math.max(0, s - 1920); e = Math.min(outN - 1, e + 1920);
  const pcm16 = out.slice(s * 2, (e + 1) * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm16.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm16.length, 40);
  return Buffer.concat([h, pcm16]);
}

const jobs = [];
for (const sc of S.LIST) sc.lines.forEach(([who, text], i) => jobs.push({
  file: path.join(ROOT, 'audio', sc.id, i + '.wav'), text,
  voice: who === 'caller' ? sc.voice : S.YOU, style: who === 'caller' ? sc.style : S.YOU_STYLE
}));
for (const [lang, text] of Object.entries(S.ALERT.text)) jobs.push({ file: path.join(ROOT, 'audio', 'alert', lang + '.wav'), text, voice: S.ALERT.voice, style: S.ALERT.style });

(async () => {
  let made = 0, skipped = 0;
  const todo = jobs.filter(j => FORCE || !fs.existsSync(j.file));
  skipped = jobs.length - todo.length;
  async function worker() {
    for (let j; (j = todo.shift());) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const r = await ScamCheck.speak({ apiKey: KEY, model: process.env.GEMINI_TTS_MODEL, text: j.text, voice: j.voice });
          fs.mkdirSync(path.dirname(j.file), { recursive: true });
          fs.writeFileSync(j.file, to16k(pcmOf(Buffer.from(r.data, 'base64'), r.mimeType)));
          made++; console.log('✓', path.relative(ROOT, j.file), r.model, r.ms + ' ms');
          await new Promise(r => setTimeout(r, PAUSE));
          break;
        } catch (e) {
          console.warn('…', path.relative(ROOT, j.file), 'attempt', attempt, e.message);
          if (attempt === 4) process.exitCode = 1;
          const wait = +((e.message.match(/retry in ([\d.]+)s/) || [])[1] || 20);
          await new Promise(r => setTimeout(r, (wait + 1) * 1000));
        }
      }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(`done: ${made} generated, ${skipped} already existed`);
})();
