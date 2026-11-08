// Step 3 · load_bronze — parse every landed government file into bronze.gov_scam_number.
// Full reload: delete all bronze rows, then insert them again from the raw files (one transaction, see run.js).
// Running it twice gives the same result. Values stay text; silver does the typing.
//
// Data contract (README → "Government list: data contract"):
//   CSV  header with at least `phone_number`; optional `category`, `first_reported_at`, `report_count`.
//   JSON { "items": [ { "phone_number": ..., ... } ], "next": ... }
// Extra columns are ignored. A file without `phone_number` fails loudly.
'use strict';
const COLS = ['phone_number', 'category', 'first_reported_at', 'report_count'];

class ContractError extends Error {}

/* Small RFC 4180 CSV parser: quotes, "" escapes, commas and new lines inside quotes, CRLF, BOM. */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

function recordsOf(file) {
  const cut = v => (v == null || v === '' ? null : String(v).slice(0, 255));
  if (file.format === 'json') {
    let j;
    try { j = JSON.parse(file.content.replace(/^﻿/, '')); } catch (e) { throw new ContractError(`file ${file.file_id} (${file.name}) is not valid JSON: ${e.message}`); }
    if (!Array.isArray(j.items)) throw new ContractError(`file ${file.file_id} (${file.name}) has no "items" array`);
    return j.items.map(it => COLS.map(c => cut(it && typeof it === 'object' ? it[c] : null)));
  }
  const rows = parseCsv(file.content);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  if (!header.includes('phone_number')) {
    throw new ContractError(`file ${file.file_id} (${file.name}) is missing the column "phone_number". Columns found: ${header.join(', ') || '(none)'}`);
  }
  const idx = COLS.map(c => header.indexOf(c));
  return rows.slice(1).map(r => idx.map(i => (i < 0 ? null : cut(r[i] === undefined ? null : r[i].trim()))));
}

module.exports = async function loadBronze({ conn: c, log }) {
  const [files] = await c.query('SELECT file_id, name, format, content FROM bronze.landed_file WHERE NOT skip ORDER BY file_id');
  // Parse everything first: a broken file stops the step before anything is written.
  const parsed = files.map(f => ({ f, recs: recordsOf(f) }));
  await c.query('DELETE FROM bronze.gov_scam_number');
  let total = 0;
  for (const { f, recs } of parsed) {
    for (let i = 0; i < recs.length; i += 1000) {
      const chunk = recs.slice(i, i + 1000).map((r, k) => [f.file_id, i + k + 1, ...r]);
      await c.query('INSERT INTO bronze.gov_scam_number (file_id, line_no, phone_number, category, first_reported_at, report_count) VALUES ?', [chunk]);
    }
    total += recs.length;
    log(`file ${f.file_id} (${f.name}): ${recs.length} row(s)`);
  }
  return total;
};
module.exports.ContractError = ContractError;
module.exports.parseCsv = parseCsv;
