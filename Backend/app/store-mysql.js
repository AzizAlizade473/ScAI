// Scam Guardian — MySQL store. Same functions as ../../store.js (the JSON file store), but async,
// plus two new ones: report() and numberRisk(). server.js picks this store when DB_HOST is set.
//
// Connection settings come only from environment variables (Backend/.env -> docker-compose.yml).
// Queries name their columns and use LIMIT/aggregates: the client gets only the data it shows.
'use strict';
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { toE164 } = require('./phone.js');

const LEVELS = ['safe', 'caution', 'danger'];
const KINDS = ['message', 'voice', 'call'];
const newId = () => crypto.randomBytes(8).toString('hex');      // 16 hex chars, same as the JSON store
const str = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.max(0, Math.min(1, +v)));
const int = v => (v == null || !Number.isFinite(+v) ? null : Math.max(0, Math.round(+v)));
const tacticCodes = t => [...new Set((Array.isArray(t) ? t : []).map(String).filter(x => /^[a-z_]{2,30}$/.test(x)))].slice(0, 20);

function createStore() {
  for (const k of ['DB_HOST', 'DB_USER', 'DB_PASSWORD']) if (!process.env[k]) throw new Error(`${k} is not set (see Backend/.env.example)`);
  const database = process.env.DB_NAME || 'app';
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database,
    connectionLimit: 5, timezone: 'Z', decimalNumbers: true, charset: 'utf8mb4'
  });
  const q = async (sql, params) => (await pool.query(sql, params))[0];

  async function tx(fn) {
    const c = await pool.getConnection();
    try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
    catch (e) { await c.rollback().catch(() => {}); throw e; }
    finally { c.release(); }
  }

  return {
    kind: 'mysql',
    file: `mysql://${process.env.DB_HOST}/${database}`,

    /* A finished check or call. Returns { id, at, ...entry } like the JSON store. */
    async add(entry) {
      const id = newId(), at = new Date();
      const reason = entry.reason && typeof entry.reason === 'object' ? entry.reason : {};
      const row = {
        public_id: id, kind: KINDS.includes(entry.kind) ? entry.kind : 'message', source: str(entry.source, 20) || 'check',
        lang: str(entry.lang, 2), text_redacted: str(entry.textRedacted, 1000),
        level: LEVELS.includes(entry.level) ? entry.level : 'safe', risk: num(entry.risk) || 0,
        rules_risk: num(entry.rulesRisk), ai_risk: num(entry.aiRisk), scam_type: str(entry.scamType, 30),
        reason_az: str(reason.az, 500), reason_ru: str(reason.ru, 500), reason_en: str(reason.en, 500),
        model: str(entry.model, 60), latency_ms: int(entry.latencyMs), simulated: !!entry.simulated,
        scenario: str(entry.scenario, 40), number_masked: str(entry.number, 16),
        duration_sec: int(entry.durationSec), stt_lines: int(entry.sttLines), created_at: at
      };
      const tactics = tacticCodes(entry.tactics);
      await tx(async c => {
        const [r] = await c.query('INSERT INTO scam_check SET ?', [row]);
        if (tactics.length) {
          // A tactic the AI names that is not in the lookup yet is added, so the FK never blocks a save.
          await c.query('INSERT IGNORE INTO tactic (tactic, label_en) VALUES ?', [tactics.map(t => [t, t])]);
          await c.query('INSERT INTO scam_check_tactic (check_id, tactic) VALUES ?', [tactics.map(t => [r.insertId, t])]);
        }
      });
      return Object.assign({ id, at: at.toISOString() }, entry);
    },

    /* History list: only the fields the History screen shows. */
    async list(limit = 100) {
      const rows = await q(
        `SELECT c.public_id, c.created_at, c.kind, c.scenario, c.text_redacted, c.level, c.risk, c.simulated,
                c.reason_az, c.reason_ru, c.reason_en, f.verdict
           FROM scam_check c LEFT JOIN check_feedback f ON f.check_id = c.check_id
          ORDER BY c.created_at DESC, c.check_id DESC
          LIMIT ?`, [Math.max(1, Math.min(500, limit | 0))]);
      return rows.map(r => ({
        id: r.public_id, at: r.created_at.toISOString(), kind: r.kind, scenario: r.scenario || undefined,
        textRedacted: r.text_redacted || undefined, level: r.level, risk: r.risk, simulated: !!r.simulated || undefined,
        reason: r.reason_az || r.reason_ru || r.reason_en ? { az: r.reason_az || '', ru: r.reason_ru || '', en: r.reason_en || '' } : null,
        feedback: r.verdict || undefined
      }));
    },

    async get(id) {
      const rows = await q('SELECT public_id, level FROM scam_check WHERE public_id = ?', [String(id)]);
      return rows[0] ? { id: rows[0].public_id, level: rows[0].level } : null;
    },

    async remove(id) {
      const r = await q('DELETE FROM scam_check WHERE public_id = ?', [String(id)]);
      return r.affectedRows > 0;
    },

    async clear() { await q('DELETE FROM scam_check'); },

    /* One answer per check: a new answer replaces the old one (upsert). */
    async feedback(f) {
      const rows = await q('SELECT check_id, level FROM scam_check WHERE public_id = ?', [String(f.entryId)]);
      if (!rows[0]) return null;
      const id = newId(), at = new Date();
      await q(`INSERT INTO check_feedback (check_id, public_id, verdict, created_at) VALUES (?, ?, ?, ?) AS n
               ON DUPLICATE KEY UPDATE verdict = n.verdict`, [rows[0].check_id, id, f.verdict, at]);
      return { id, at: at.toISOString(), entryId: String(f.entryId), verdict: f.verdict, level: rows[0].level };
    },

    /* Counts are computed by MySQL; no rows are pulled into the server. */
    async stats() {
      const [t] = await q('SELECT COUNT(*) AS total FROM scam_check');
      const byLevel = Object.fromEntries((await q('SELECT level, COUNT(*) AS n FROM scam_check GROUP BY level')).map(r => [r.level, r.n]));
      const byKind = Object.fromEntries((await q('SELECT kind, COUNT(*) AS n FROM scam_check GROUP BY kind')).map(r => [r.kind, r.n]));
      const [fb] = await q(`SELECT COUNT(*) AS total, COALESCE(SUM(verdict = 'correct'), 0) AS correct,
                                   COALESCE(SUM(verdict = 'wrong'), 0) AS wrong FROM check_feedback`);
      return { total: t.total, byLevel, byKind, feedback: { total: fb.total, correct: +fb.correct, wrong: +fb.wrong } };
    },

    /* New: a user reports a number as a scam. Grows our own scam-number list. */
    async report(r) {
      const phone = toE164(r.number);
      if (!phone) { const e = new Error('Not a valid phone number'); e.status = 400; throw e; }
      const id = newId();
      let checkId = null;
      if (r.checkId) { const c = await q('SELECT check_id FROM scam_check WHERE public_id = ?', [String(r.checkId)]); checkId = c[0] ? c[0].check_id : null; }
      await q('INSERT INTO scam_report (public_id, phone_e164, check_id, reason) VALUES (?, ?, ?, ?)',
        [id, phone, checkId, /^[a-z_]{2,30}$/.test(r.reason || '') ? r.reason : null]);
      return { id, number: phone };
    },

    /* New: the plain-language answer for one number, read from the gold layer. */
    async numberRisk(number) {
      const phone = toE164(number);
      if (!phone) { const e = new Error('Not a valid phone number'); e.status = 400; throw e; }
      const rows = await q(
        `SELECT m.gov_listed, m.gov_category, m.gov_report_count + m.user_report_count AS reports, m.user_report_count, r.code, r.label, r.advice_en
           FROM gold.mart_number_risk m JOIN gold.dim_risk_level r ON r.risk_level_key = m.risk_level_key
          WHERE m.phone_e164 = ?`, [phone]);
      if (!rows[0]) return { number: phone, known: false };
      const m = rows[0];
      return { number: phone, known: true, risk: m.label, level: m.code, govListed: !!m.gov_listed, category: m.gov_category, reports: m.reports, userReports: m.user_report_count, advice: m.advice_en };
    },

    /* New: question 2 for the app, read from the gold marts (the pipeline builds them).
     * Only aggregates leave the database: per-day totals, the top tactics and the number-list size. */
    async insights(days = 14) {
      const daily = await q(
        `SELECT d.full_date, ch.code AS channel, m.checks, m.scams, m.high_risk, m.avg_risk, m.feedback_correct, m.feedback_wrong
           FROM gold.mart_daily_scam_summary m
           JOIN gold.dim_date d ON d.date_key = m.date_key
           JOIN gold.dim_channel ch ON ch.channel_key = m.channel_key
          WHERE d.full_date >= (SELECT MAX(full_date) FROM gold.dim_date) - INTERVAL ? DAY
          ORDER BY d.full_date, ch.channel_key`, [Math.max(1, Math.min(90, days | 0)) - 1]);
      const tactics = await q(
        `SELECT t.code, COUNT(*) AS n
           FROM gold.bridge_check_tactic b
           JOIN gold.fact_scam_check f ON f.check_key = b.check_key
           JOIN gold.dim_tactic t ON t.tactic_key = b.tactic_key
          WHERE f.is_scam
          GROUP BY t.code ORDER BY n DESC, t.code LIMIT 5`);
      const [nr] = await q(
        `SELECT COUNT(*) AS numbers, COALESCE(SUM(gov_listed), 0) AS gov, COALESCE(SUM(risk_level_key = 3), 0) AS high
           FROM gold.mart_number_risk`);
      const [tot] = await q('SELECT COUNT(*) AS checks, COALESCE(SUM(is_scam), 0) AS scams FROM gold.fact_scam_check');
      return {
        daily: daily.map(r => ({ date: r.full_date instanceof Date ? r.full_date.toISOString().slice(0, 10) : String(r.full_date).slice(0, 10), channel: r.channel, checks: r.checks, scams: +r.scams, highRisk: +r.high_risk, avgRisk: r.avg_risk, correct: +r.feedback_correct, wrong: +r.feedback_wrong })),
        tactics: tactics.map(r => ({ tactic: r.code, n: r.n })),
        totals: { checks: tot.checks, scams: +tot.scams },
        numbers: { total: nr.numbers, govListed: +nr.gov, high: +nr.high }
      };
    },

    flushNow() { /* MySQL writes are already durable */ },
    close() { return pool.end(); }
  };
}

module.exports = { createStore };
