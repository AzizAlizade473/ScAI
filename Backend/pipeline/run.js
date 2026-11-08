// Yunex pipeline — runs the steps in order, with quality gates between layers and a record of every run.
//
//   fetch_gov ─┐
//              ├─> load_bronze ─> silver ─> gold          (each step is followed by its checks)
//   extract_app┘
//
// Usage (inside Docker: `docker compose run --rm pipeline [steps...]`):
//   node pipeline/run.js                 all steps
//   node pipeline/run.js silver gold     re-run only these steps (no need to start everything over)
//
// PIPELINE_EVERY_MINUTES in Backend/.env: 0 = run once and stop (default); 1440 = once a day.
'use strict';
const { connect, sqlStep } = require('./db.js');
const CHECKS = require('./checks.js');

const STEPS = [
  { name: 'fetch_gov',   run: require('./steps/fetch_gov.js') },
  { name: 'extract_app', run: require('./steps/extract_app.js') },
  { name: 'load_bronze', run: require('./steps/load_bronze.js') },
  { name: 'silver',      run: sqlStep('silver.sql') },
  { name: 'gold',        run: sqlStep('gold.sql') }
];
const TRANSIENT = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const RETRY_DELAYS = [2000, 4000];                                 // a second (and third) chance for flaky connections
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

class QualityError extends Error {}

/* Checks read through the step's own connection (they see its uncommitted rows);
 * results are recorded through the pool, so they are kept even when the step rolls back. */
async function runChecks(conn, db, runId, step) {
  const failed = [];
  for (const [layer, name, sql] of CHECKS[step] || []) {
    const [[row]] = await conn.query(sql);
    const bad = Number(Object.values(row)[0]) || 0;
    await db.query('INSERT INTO ops.dq_check (run_id, layer, check_name, bad_rows, passed) VALUES (?, ?, ?, ?, ?)', [runId, layer, name, bad, bad === 0]);
    console.log(`  ${bad === 0 ? 'PASS' : 'FAIL'}  ${name}${bad ? ` (${bad} bad row(s))` : ''}`);
    if (bad) failed.push(`${name}: ${bad} bad row(s)`);
  }
  if (failed.length) throw new QualityError('Quality check failed: ' + failed.join('; ') + '. The step was rolled back.');
}

/* One step = one transaction: the step's writes and its passed checks commit together.
 * A failing statement or check rolls everything back, so a layer never holds half-checked data. */
async function runStep(db, runId, step) {
  for (let attempt = 0; ; attempt++) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const rows = await step.run({ conn, runId, log: m => console.log('  ' + m) });
      console.log(`  ${rows} row(s) written`);
      await runChecks(conn, db, runId, step.name);
      await conn.commit();
      return rows;
    } catch (e) {
      await conn.rollback().catch(() => {});
      if (!TRANSIENT.has(e.code) || attempt >= RETRY_DELAYS.length) throw e;
      console.log(`  ${e.code}: retrying in ${RETRY_DELAYS[attempt] / 1000}s`);
      await sleep(RETRY_DELAYS[attempt]);
      await db.query('UPDATE ops.step_run SET attempts = attempts + 1 WHERE run_id = ? AND step = ?', [runId, step.name]);
    } finally { conn.release(); }
  }
}

async function runOnce(db, steps) {
  const [r] = await db.query('INSERT INTO ops.pipeline_run (steps) VALUES (?)', [steps.map(s => s.name).join(',')]);
  const runId = r.insertId;
  console.log(`\n[${stamp()}] pipeline run ${runId}: ${steps.map(s => s.name).join(' -> ')}`);
  let current = null;
  try {
    for (const step of steps) {
      current = step.name;
      await db.query('INSERT INTO ops.step_run (run_id, step) VALUES (?, ?)', [runId, step.name]);
      console.log(`- ${step.name}`);
      const rows = await runStep(db, runId, step);
      await db.query(`UPDATE ops.step_run SET status = 'success', rows_written = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE run_id = ? AND step = ?`, [rows, runId, step.name]);
    }
    await db.query(`UPDATE ops.pipeline_run SET status = 'success', finished_at = CURRENT_TIMESTAMP(3) WHERE run_id = ?`, [runId]);
    console.log(`[${stamp()}] run ${runId}: SUCCESS`);
    return true;
  } catch (e) {
    const msg = String(e.message || e).slice(0, 2000);
    await db.query(`UPDATE ops.step_run SET status = 'failed', message = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE run_id = ? AND step = ?`, [msg, runId, current]).catch(() => {});
    await db.query(`UPDATE ops.pipeline_run SET status = 'failed', failed_step = ?, error = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE run_id = ?`, [current, msg, runId]).catch(() => {});
    console.error(`[${stamp()}] run ${runId}: FAILED at ${current}\n  ${msg}\n  Fix the cause, then re-run from this step: docker compose run --rm pipeline ${steps.slice(steps.findIndex(s => s.name === current)).map(s => s.name).join(' ')}`);
    return false;
  }
}

async function main() {
  const want = process.argv.slice(2);
  const unknown = want.filter(w => !STEPS.some(s => s.name === w));
  if (unknown.length) { console.error(`Unknown step(s): ${unknown.join(', ')}. Steps: ${STEPS.map(s => s.name).join(', ')}`); process.exit(2); }
  const steps = want.length ? STEPS.filter(s => want.includes(s.name)) : STEPS;
  const every = Math.max(0, Number(process.env.PIPELINE_EVERY_MINUTES) || 0);
  const db = connect();
  let ok;
  do {
    try { ok = await runOnce(db, steps); }
    catch (e) { ok = false; console.error(`[${stamp()}] could not start a run: ${e.message}`); }   // e.g. MySQL not reachable
    if (every) { console.log(`next run in ${every} minute(s)`); await sleep(every * 60 * 1000); }
  } while (every);
  await db.end();
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('[pipeline]', e.message); process.exit(1); });
