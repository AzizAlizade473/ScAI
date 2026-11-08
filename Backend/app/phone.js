// One phone-number convention for the whole backend: E.164, e.g. "+994124047731".
// The pipeline's silver step uses the same rules in SQL (pipeline/sql/silver.sql). Keep them in sync.
'use strict';

function toE164(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const d = s.replace(/\D/g, '');
  if (/^994\d{9}$/.test(d)) return '+' + d;                    // 994 12 404 77 31
  if (/^00\d{8,15}$/.test(d)) return '+' + d.slice(2);         // 00994...
  if (/^0\d{9}$/.test(d)) return '+994' + d.slice(1);          // 012 404 77 31 (local, leading 0)
  if (/^\d{9}$/.test(d)) return '+994' + d;                    // 124047731 (local, no 0)
  if (s.startsWith('+') && /^\d{8,15}$/.test(d)) return '+' + d; // any other international number
  return null;
}

module.exports = { toE164 };
