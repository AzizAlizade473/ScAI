// Step 2 · extract_app — copy new and changed app rows into bronze.app_event (incremental).
//
// Watermark = the highest updated_at already loaded from each app table (ops.watermark).
// Each run reads only rows with updated_at >= watermark - 1 minute, inserts them with INSERT IGNORE
// (a row version already copied is skipped), then moves the watermark forward in the SAME transaction
// (run.js commits the copy, the watermark and the passed checks together).
// The 1-minute overlap catches rows that committed late; the unique key makes the overlap harmless.
//
// Only the columns analytics needs are copied. The message text never leaves the app tables.
'use strict';

const SOURCES = [
  {
    source: 'app.scam_check', table: 'scam_check',
    select: `SELECT c.public_id AS source_id, c.updated_at AS source_updated_at,
               JSON_OBJECT('kind', c.kind, 'lang', c.lang, 'level', c.level, 'risk', c.risk,
                           'rules_risk', c.rules_risk, 'ai_risk', c.ai_risk, 'scam_type', c.scam_type,
                           'model', c.model, 'latency_ms', c.latency_ms, 'simulated', c.simulated, 'created_at', c.created_at,
                           'tactics', COALESCE((SELECT JSON_ARRAYAGG(t.tactic) FROM app.scam_check_tactic t WHERE t.check_id = c.check_id), JSON_ARRAY())) AS payload
             FROM app.scam_check c WHERE c.updated_at >= ?`
  },
  {
    source: 'app.check_feedback', table: 'check_feedback',
    select: `SELECT f.public_id AS source_id, f.updated_at AS source_updated_at, JSON_OBJECT('check_id', c.public_id, 'verdict', f.verdict) AS payload
             FROM app.check_feedback f JOIN app.scam_check c ON c.check_id = f.check_id WHERE f.updated_at >= ?`
  },
  {
    source: 'app.scam_report', table: 'scam_report',
    select: `SELECT r.public_id AS source_id, r.updated_at AS source_updated_at,
               JSON_OBJECT('phone_e164', r.phone_e164, 'reason', r.reason, 'created_at', r.created_at) AS payload
             FROM app.scam_report r WHERE r.updated_at >= ?`
  }
];

module.exports = async function extractApp({ conn: c, runId, log }) {
  let total = 0;
  for (const s of SOURCES) {
    total += await (async () => {
      const [[w]] = await c.query('SELECT high_water FROM ops.watermark WHERE source = ? FOR UPDATE', [s.source]);
      const from = w ? new Date(w.high_water.getTime() - 60 * 1000) : new Date(0);
      const [r] = await c.query(
        `INSERT IGNORE INTO bronze.app_event (source_table, source_id, source_updated_at, payload, run_id)
         SELECT ?, x.source_id, x.source_updated_at, x.payload, ? FROM (${s.select}) AS x`, [s.table, runId, from]);
      const [[m]] = await c.query('SELECT MAX(source_updated_at) AS hw FROM bronze.app_event WHERE source_table = ?', [s.table]);
      if (m.hw) {
        await c.query(`INSERT INTO ops.watermark (source, high_water, run_id) VALUES (?, ?, ?) AS n
                       ON DUPLICATE KEY UPDATE high_water = GREATEST(ops.watermark.high_water, n.high_water), run_id = n.run_id`, [s.source, m.hw, runId]);
      }
      log(`${s.source}: ${r.affectedRows} new row version(s); watermark ${m.hw ? m.hw.toISOString() : '(none yet)'}`);
      return r.affectedRows;
    })();
  }
  return total;
};
