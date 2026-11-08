-- Step 4 · silver — bronze -> typed, deduplicated, one convention.
-- Full rebuild. run.js wraps the step and its checks in one transaction: run it twice, get the same
-- result; if a statement or a check fails, everything rolls back and silver keeps its last good data.
-- Dedup = "latest version wins" (ROW_NUMBER ... ORDER BY newest first), the MySQL form of DISTINCT ON.

-- ---- Government scam-number list: one row per phone number ---------------------------------
DELETE FROM silver.gov_scam_number;

INSERT INTO silver.gov_scam_number (phone_e164, category, first_reported_at, report_count, file_id)
SELECT phone_e164, category, first_reported_at, report_count, file_id
FROM (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY t.phone_e164 ORDER BY t.file_id DESC, t.line_no DESC) AS rn
  FROM silver.v_gov_scam_number_typed t
  WHERE t.is_valid                                -- invalid rows are counted by the silver check and stop the run
) ranked
WHERE rn = 1;

-- ---- Scam checks from the app: one row per check, with its latest feedback ------------------
DELETE FROM silver.scam_check_tactic;
DELETE FROM silver.scam_check;

INSERT INTO silver.scam_check
  (check_id, kind, lang, level, risk, rules_risk, ai_risk, scam_type, model, latency_ms, simulated, feedback, checked_at)
SELECT
  c.source_id,
  JSON_VALUE(c.payload, '$.kind'),
  JSON_VALUE(c.payload, '$.lang'),
  JSON_VALUE(c.payload, '$.level'),
  JSON_VALUE(c.payload, '$.risk'       RETURNING DECIMAL(4,3)),
  JSON_VALUE(c.payload, '$.rules_risk' RETURNING DECIMAL(4,3)),
  JSON_VALUE(c.payload, '$.ai_risk'    RETURNING DECIMAL(4,3)),
  COALESCE(JSON_VALUE(c.payload, '$.scam_type'), 'none'),
  JSON_VALUE(c.payload, '$.model'),
  JSON_VALUE(c.payload, '$.latency_ms' RETURNING UNSIGNED),
  COALESCE(JSON_VALUE(c.payload, '$.simulated' RETURNING UNSIGNED), 0),
  f.verdict,
  JSON_VALUE(c.payload, '$.created_at' RETURNING DATETIME(3))
FROM (
  SELECT e.source_id, e.payload,
         ROW_NUMBER() OVER (PARTITION BY e.source_id ORDER BY e.source_updated_at DESC, e.event_id DESC) AS rn
  FROM bronze.app_event e WHERE e.source_table = 'scam_check'
) c
LEFT JOIN (
  SELECT JSON_VALUE(e.payload, '$.check_id') AS check_id, JSON_VALUE(e.payload, '$.verdict') AS verdict,
         ROW_NUMBER() OVER (PARTITION BY JSON_VALUE(e.payload, '$.check_id') ORDER BY e.source_updated_at DESC, e.event_id DESC) AS rn
  FROM bronze.app_event e WHERE e.source_table = 'check_feedback'
) f ON f.check_id = c.source_id AND f.rn = 1
WHERE c.rn = 1;

-- One row per (check, tactic): the JSON list becomes rows (1NF).
INSERT INTO silver.scam_check_tactic (check_id, tactic)
SELECT DISTINCT c.source_id, jt.tactic
FROM (
  SELECT e.source_id, e.payload,
         ROW_NUMBER() OVER (PARTITION BY e.source_id ORDER BY e.source_updated_at DESC, e.event_id DESC) AS rn
  FROM bronze.app_event e WHERE e.source_table = 'scam_check'
) c,
JSON_TABLE(c.payload, '$.tactics[*]' COLUMNS (tactic VARCHAR(30) PATH '$')) AS jt
WHERE c.rn = 1 AND jt.tactic IS NOT NULL;

-- ---- User reports of phone numbers: one row per report -------------------------------------
DELETE FROM silver.user_report;

INSERT INTO silver.user_report (report_id, phone_e164, reason, reported_at)
SELECT
  r.source_id,
  JSON_VALUE(r.payload, '$.phone_e164'),
  JSON_VALUE(r.payload, '$.reason'),
  JSON_VALUE(r.payload, '$.created_at' RETURNING DATETIME(3))
FROM (
  SELECT e.source_id, e.payload,
         ROW_NUMBER() OVER (PARTITION BY e.source_id ORDER BY e.source_updated_at DESC, e.event_id DESC) AS rn
  FROM bronze.app_event e WHERE e.source_table = 'scam_report'
) r
WHERE r.rn = 1;

