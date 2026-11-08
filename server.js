// Scam Guardian server.
// Serves the app, runs the rules engine, and proxies Gemini (scam analysis, speech-to-text,
// text-to-speech) so the API key never reaches the browser. Stores only redacted results.
//
//   1. Put your key in .env (see .env.example) or set GEMINI_API_KEY
//   2. node server.js
//   3. Open http://localhost:8787
//
// No npm install needed (Node 18+).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ScamCheck = require('./scam-check.js');
const Rules = require('./rules.js');
const { createStore } = require('./store.js');

const ROOT = __dirname;
loadEnv();
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || ScamCheck.DEFAULT_MODEL;
const STT_MODEL = process.env.GEMINI_STT_MODEL || ScamCheck.STT_MODELS[0];
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || ScamCheck.TTS_MODELS[0];
const BASE = process.env.GEMINI_BASE_URL || undefined; // only for tests / mocks
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const store = createStore(DATA);
const TTS_CACHE = path.join(DATA, 'tts-cache');
fs.mkdirSync(TTS_CACHE, { recursive: true });

/* Result cache for identical inputs (same audio bytes / same transcript). Free-tier Gemini quotas are
 * small, so a repeated demo reuses the earlier real result; every cached answer is labelled
 * `cached: true` with its original model and latency. Clients send `fresh: true` to force a new call. */
const CACHE_FILE = path.join(DATA, 'cache.json');
let cache = { stt: {}, ai: {} };
try { cache = Object.assign(cache, JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))); } catch { /* empty */ }
let cacheTimer = null;
function cacheSet(kind, key, value) {
  const m = cache[kind]; m[key] = Object.assign({ at: new Date().toISOString() }, value);
  const keys = Object.keys(m); if (keys.length > 400) delete m[keys[0]];
  if (!cacheTimer) cacheTimer = setTimeout(() => { cacheTimer = null; fs.writeFile(CACHE_FILE, JSON.stringify(cache), () => {}); }, 300);
}
const sha1 = x => crypto.createHash('sha1').update(x).digest('hex');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav', '.md': 'text/plain; charset=utf-8' };
const PUBLIC = new Set(['/index.html', '/scam-check.js', '/rules.js', '/lab.js', '/lab.css', '/scenarios.js']);
const PUBLIC_DIRS = [/^\/audio\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?\.wav$/];

function loadEnv() {
  let txt;
  try { txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin'
};
function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, SEC_HEADERS, extra));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const fail = (status, msg) => Object.assign(new Error(msg), { status });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(fail(413, 'Request too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit = 32 * 1024) {
  const b = await readBody(req, limit);
  try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw fail(400, 'Invalid JSON'); }
}

/* Simple per-IP rate limit for the paid AI endpoints. */
const buckets = new Map();
function rateLimit(req, cost = 1) {
  const ip = req.socket.remoteAddress || '?', now = Date.now();
  const b = buckets.get(ip) || { tokens: 60, at: now };
  b.tokens = Math.min(60, b.tokens + (now - b.at) / 1000); b.at = now;
  if (b.tokens < cost) throw fail(429, 'Too many requests — wait a few seconds');
  b.tokens -= cost; buckets.set(ip, b);
}
/* Browsers send Origin on cross-site POSTs: refuse requests from other sites. */
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o || o === 'null') return;
  try { if (new URL(o).host !== req.headers.host) throw 0; } catch { throw fail(403, 'Cross-origin request refused'); }
}
const needKey = () => { if (!KEY) throw fail(503, 'GEMINI_API_KEY is not set on the server'); };
const aiOpts = extra => Object.assign({ apiKey: KEY, baseUrl: BASE }, extra);

function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function toWav(audio) {
  const buf = Buffer.from(audio.data, 'base64');
  if (buf.slice(0, 4).toString() === 'RIFF') return buf;
  const rate = +((String(audio.mimeType).match(/rate=(\d+)/) || [])[1] || 24000);
  return wavFromPcm(buf, rate);
}

const maskNumber = n => { const d = String(n || '').replace(/\D/g, ''); return d.length > 4 ? '•••• ' + d.slice(-4) : ''; };
const LEVELS = ['safe', 'caution', 'danger'];

/* ---------- handlers ---------- */
async function analyze(b) {
  const text = String(b.text || '').slice(0, 4000).trim();
  if (!text) throw fail(400, 'Text is empty');
  const t0 = Date.now();
  const rules = Rules.analyze(text);
  const rulesMs = Date.now() - t0;
  let ai = null, aiError = null;
  if (KEY) {
    try {
      const key = sha1(JSON.stringify([MODEL, 'msg', text, b.channel || '', !!b.knownContact]));
      if (!b.fresh && cache.ai[key]) ai = Object.assign({}, cache.ai[key], { cached: true });
      else { ai = await ScamCheck.classify(aiOpts({ model: MODEL, kind: 'message', text, channel: b.channel, links: rules.links, signals: { knownContact: !!b.knownContact } })); cacheSet('ai', key, ai); }
    } catch (e) { aiError = e.message; }
  } else aiError = 'AI is off (no GEMINI_API_KEY)';
  const fused = Rules.fuse(rules, ai);
  const out = {
    textRedacted: ScamCheck.redact(text), rules, ai, aiError, fused,
    latency: { rulesMs, aiMs: ai ? ai.ms : null, totalMs: Date.now() - t0 }, model: ai ? ai.model : null
  };
  if (b.save !== false) {
    const e = store.add({
      kind: b.source === 'voice' ? 'voice' : 'message', source: String(b.source || 'check').slice(0, 20), lang: String(b.lang || '').slice(0, 2),
      textRedacted: out.textRedacted.slice(0, 1000), level: fused.level, risk: fused.risk, rulesRisk: rules.risk, aiRisk: ai ? ai.risk : null,
      tactics: [...new Set(rules.tactics.concat(ai ? ai.tactics : []))], scamType: ai ? ai.scamType : null,
      reason: ai ? ai.reason : null, model: out.model, latencyMs: out.latency.totalMs
    });
    out.id = e.id;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    /* The Android app loads its UI from the APK (file://, Origin "null") and calls this API across origins.
     * Only that origin gets CORS; other websites still cannot spend this server's Gemini quota. */
    if (req.headers.origin === 'null' && p.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', 'null');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
        return res.end();
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') sameOrigin(req);

    if (req.method === 'GET' && p === '/api/health') {
      return send(res, 200, { gemini: Boolean(KEY), model: MODEL, fallbacks: ScamCheck.FALLBACK_MODELS, stt: STT_MODEL, tts: TTS_MODEL, store: true, history: store.stats().total, cooling: ScamCheck.status() });
    }
    if (req.method === 'POST' && p === '/api/classify') {            // live call transcript → AI verdict
      needKey(); rateLimit(req);
      const b = await readJson(req);
      const transcript = (Array.isArray(b.transcript) ? b.transcript : []).slice(-20)
        .map(l => ({ who: l && l.who === 'you' ? 'you' : 'caller', text: String((l && l.text) || '').slice(0, 500) }));
      const s = b.signals || {};
      const signals = { reports: Math.max(0, Math.min(9999, s.reports | 0)), knownContact: !!s.knownContact, smsCodeArrived: !!s.smsCodeArrived };
      const key = sha1(JSON.stringify([MODEL, transcript, signals]));
      if (!b.fresh && cache.ai[key]) return send(res, 200, Object.assign({}, cache.ai[key], { cached: true }));
      const r = await ScamCheck.classify(aiOpts({ model: MODEL, kind: 'call', transcript, signals }));
      cacheSet('ai', key, r);
      return send(res, 200, r);
    }
    if (req.method === 'POST' && p === '/api/analyze') {             // message / link / transcript → rules + AI + fusion
      rateLimit(req);
      return send(res, 200, await analyze(await readJson(req)));
    }
    if (req.method === 'POST' && p === '/api/transcribe') {          // audio bytes → real speech-to-text
      needKey(); rateLimit(req, 2);
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      if (!/^audio\/(wav|x-wav|webm|ogg|mpeg|mp4|aac|flac)$/.test(type)) throw fail(415, 'Send audio as audio/wav, audio/webm, audio/ogg or audio/mp4');
      const audio = await readBody(req, 10 * 1024 * 1024);
      if (audio.length < 1000) throw fail(400, 'Audio is too short');
      const key = sha1(audio);                                         // audio itself is never stored
      if (url.searchParams.get('fresh') !== '1' && cache.stt[key]) return send(res, 200, Object.assign({}, cache.stt[key], { cached: true }));
      const r = await ScamCheck.transcribe(aiOpts({ model: STT_MODEL, mimeType: type.replace('x-wav', 'wav'), audioBase64: audio.toString('base64') }));
      if (r.text && url.searchParams.get('store') !== '0') cacheSet('stt', key, r);   // consented recordings: store=0
      return send(res, 200, r);
    }
    if (req.method === 'POST' && p === '/api/tts') {                 // text → speech (cached by content hash)
      const b = await readJson(req);
      const text = String(b.text || '').trim().slice(0, 600);
      if (!text) throw fail(400, 'Text is empty');
      const voice = /^[A-Za-z]{3,20}$/.test(b.voice || '') ? b.voice : 'Charon';
      const style = String(b.style || '').slice(0, 200);
      const hash = crypto.createHash('sha1').update([TTS_MODEL, voice, style, text].join('|')).digest('hex');
      const file = path.join(TTS_CACHE, hash + '.wav');
      if (fs.existsSync(file)) return send(res, 200, fs.readFileSync(file), 'audio/wav', { 'X-TTS-Cache': 'hit' });
      needKey(); rateLimit(req, 3);
      const r = await ScamCheck.speak(aiOpts({ model: TTS_MODEL, text, voice, style }));
      const wav = toWav(r);
      fs.writeFileSync(file, wav);
      return send(res, 200, wav, 'audio/wav', { 'X-TTS-Model': r.model, 'X-TTS-Ms': String(r.ms) });
    }
    if (p === '/api/history') {
      if (req.method === 'GET') return send(res, 200, { items: store.list(Math.min(500, +url.searchParams.get('limit') || 100)), stats: store.stats() });
      if (req.method === 'DELETE') { store.clear(); return send(res, 200, { ok: true }); }
      if (req.method === 'POST') {                                     // a finished call: alert metadata only
        const b = await readJson(req);
        const e = store.add({
          kind: 'call', simulated: true, scenario: String(b.scenario || '').slice(0, 40),
          level: LEVELS.includes(b.level) ? b.level : 'safe', risk: Math.max(0, Math.min(1, +b.risk || 0)),
          tactics: (Array.isArray(b.tactics) ? b.tactics : []).map(String).filter(t => /^[a-z_]{2,30}$/.test(t)).slice(0, 10),
          scamType: /^[a-z_]{2,30}$/.test(b.scamType || '') ? b.scamType : null, number: maskNumber(b.number),
          reason: b.reason && typeof b.reason === 'object' ? { az: String(b.reason.az || '').slice(0, 300), ru: String(b.reason.ru || '').slice(0, 300), en: String(b.reason.en || '').slice(0, 300) } : null,
          durationSec: Math.max(0, Math.min(36000, b.durationSec | 0)), sttLines: b.sttLines | 0
        });
        return send(res, 200, { id: e.id });
      }
    }
    const m = p.match(/^\/api\/history\/([a-f0-9]{16})$/);
    if (m && req.method === 'DELETE') return send(res, store.remove(m[1]) ? 200 : 404, { ok: true });
    if (req.method === 'POST' && p === '/api/feedback') {
      const b = await readJson(req);
      if (!['correct', 'wrong'].includes(b.verdict)) throw fail(400, 'verdict must be "correct" or "wrong"');
      const entry = store.get(String(b.id || ''));
      if (!entry) throw fail(404, 'Unknown history id');
      return send(res, 200, store.feedback({ entryId: entry.id, verdict: b.verdict, level: entry.level }));
    }
    if (req.method === 'GET' && p === '/api/eval') {
      const f = path.join(ROOT, 'eval', 'results.json');
      if (!fs.existsSync(f)) throw fail(404, 'No evaluation has been run yet (node eval/run.js)');
      return send(res, 200, fs.readFileSync(f), TYPES['.json']);
    }
    if (req.method === 'GET' && p === '/api/stats') return send(res, 200, store.stats());

    if (req.method === 'GET' || req.method === 'HEAD') {
      const f = p === '/' ? '/index.html' : p;
      if (!PUBLIC.has(f) && !PUBLIC_DIRS.some(re => re.test(f))) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      const full = path.join(ROOT, f);
      if (!full.startsWith(ROOT) || !fs.existsSync(full)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      const cache = f.startsWith('/audio/') ? { 'Cache-Control': 'public, max-age=86400' } : {};
      return send(res, 200, fs.readFileSync(full), TYPES[path.extname(f)] || 'application/octet-stream', cache);
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('[server]', p, e.message);
    send(res, e.status && e.status < 600 ? e.status : 502, { error: e.message });
  }
});

process.on('SIGINT', () => { store.flushNow(); process.exit(0); });
server.listen(PORT, HOST, () => {
  console.log(`Scam Guardian running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(KEY ? `Gemini: ON — analysis ${MODEL} · speech-to-text ${STT_MODEL} · text-to-speech ${TTS_MODEL}` : 'Gemini: OFF — set GEMINI_API_KEY in .env (rules engine still works)');
  console.log(`History store: ${store.file}`);
});
