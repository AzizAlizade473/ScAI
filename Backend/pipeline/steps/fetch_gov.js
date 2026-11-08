// Step 1 · fetch_gov — land the government scam-number list in bronze.landed_file, exactly as received.
//   a) every .csv / .json file in the inbox folder (Backend/inbox -> /inbox in Docker)
//   b) the government API, only if GOV_SCAM_API_URL is set in Backend/.env
// Nothing is parsed here ("land raw first"). The same content twice is landed once (sha256 is unique).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INBOX = process.env.INBOX_DIR || path.join(__dirname, '..', '..', 'inbox');
const MAX_PAGES = 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Data rows counted on arrival, so the bronze check can compare. */
function countRows(text, format) {
  if (format === 'json') { try { const j = JSON.parse(text.replace(/^﻿/, '')); return Array.isArray(j.items) ? j.items.length : 0; } catch { return 0; } }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  return Math.max(0, lines.length - 1);                         // minus the header line
}

async function land(conn, runId, { source, name, format, bytes }) {
  const text = bytes.toString('utf8');
  const [r] = await conn.query(
    `INSERT IGNORE INTO bronze.landed_file (source, name, format, sha256, byte_size, expected_rows, content, run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [source, name.slice(0, 500), format, crypto.createHash('sha256').update(bytes).digest('hex'), bytes.length, countRows(text, format), text, runId]);
  return r.affectedRows;                                        // 1 = new, 0 = already landed
}

/* Six habits for talking to an API: paginate, token from .env, respect 429 Retry-After,
 * retry network/429/5xx with backoff (1s, 2s, 4s) then give up loudly, fail fast on 4xx. */
async function getWithRetry(url, token) {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    let res, err;
    try { res = await fetch(url, { headers: Object.assign({ Accept: 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), signal: AbortSignal.timeout(30000) }); }
    catch (e) { err = e; }
    if (res && res.ok) return Buffer.from(await res.arrayBuffer());
    const retryable = err || res.status === 429 || res.status >= 500;
    if (!retryable) throw new Error(`Government API answered ${res.status} for ${url}. ${res.status === 401 || res.status === 403 ? 'Check GOV_SCAM_API_TOKEN in Backend/.env.' : 'Fix the request; retrying will not help.'}`);
    if (attempt >= delays.length) throw new Error(`Government API failed after ${attempt + 1} tries (${err ? err.message : 'HTTP ' + res.status}): ${url}`);
    const retryAfter = res && Number(res.headers.get('retry-after'));
    const wait = res && res.status === 429 && retryAfter > 0 ? Math.min(60, retryAfter) * 1000 : delays[attempt];
    console.log(`  [fetch_gov] ${err ? err.message : 'HTTP ' + res.status}; retry in ${wait / 1000}s`);
    await sleep(wait);
  }
}

module.exports = async function fetchGov({ conn, runId, log }) {
  let landed = 0;

  // a) inbox folder
  const files = fs.existsSync(INBOX) ? fs.readdirSync(INBOX).filter(f => /\.(csv|json)$/i.test(f)).sort() : [];
  for (const f of files) {
    const n = await land(conn, runId, { source: 'gov_inbox', name: f, format: f.toLowerCase().endsWith('.json') ? 'json' : 'csv', bytes: fs.readFileSync(path.join(INBOX, f)) });
    landed += n;
    log(`${n ? 'landed' : 'already landed'}: inbox/${f}`);
  }

  // b) government API (optional). Expected page shape: { "items": [ ... ], "next": "<url or null>" }
  const base = process.env.GOV_SCAM_API_URL;
  if (base) {
    let url = base, pages = 0;
    while (url && pages < MAX_PAGES) {
      const bytes = await getWithRetry(url, process.env.GOV_SCAM_API_TOKEN);
      landed += await land(conn, runId, { source: 'gov_api', name: url, format: 'json', bytes });
      pages++;
      let page;
      try { page = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`Government API page is not JSON: ${url} (it was landed; see bronze.landed_file)`); }
      if (!Array.isArray(page.items) || page.items.length === 0 || !page.next) break;   // empty page or no next link = done
      url = new URL(page.next, url).toString();
    }
    log(`government API: ${pages} page(s) read`);
  } else log('government API: not configured (GOV_SCAM_API_URL is empty), skipped');

  return landed;
};
