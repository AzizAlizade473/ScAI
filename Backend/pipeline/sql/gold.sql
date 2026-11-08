-- Step 5 · gold — silver -> star schema + marts, shaped for the questions.
-- Dimensions: new members added, existing ones updated in place (SCD Type 1, upsert).
-- Facts and marts: rebuilt in full. run.js wraps the step and its checks in one transaction (idempotent).

SET SESSION cte_max_recursion_depth = 100000;

-- ---- Dimensions -------------------------------------------------------------------------------

-- dim_date: every day from the first to the last check. Dates never change, so INSERT IGNORE.
INSERT IGNORE INTO gold.dim_date (date_key, full_date, year, month, day, weekday, is_weekend)
WITH RECURSIVE bounds AS (
  SELECT DATE(MIN(checked_at)) AS d0, DATE(MAX(checked_at)) AS d1 FROM silver.scam_check
), days AS (
  SELECT d0 AS d FROM bounds WHERE d0 IS NOT NULL
  UNION ALL
  SELECT days.d + INTERVAL 1 DAY FROM days JOIN bounds ON days.d < bounds.d1
)
SELECT CAST(DATE_FORMAT(d, '%Y%m%d') AS UNSIGNED), d, YEAR(d), MONTH(d), DAY(d), DAYNAME(d), DAYOFWEEK(d) IN (1, 7)
FROM days;

-- dim_tactic: the small tactic lookup, read straight from the app (reference data). SCD Type 1.
INSERT INTO gold.dim_tactic (code, label, severity)
SELECT * FROM (SELECT t.tactic AS code, t.label_en AS label, t.severity AS severity FROM app.tactic t) AS src
ON DUPLICATE KEY UPDATE label = src.label, severity = src.severity;

-- ---- Facts --------------------------------------------------------------------------------------
DELETE FROM gold.bridge_check_tactic;
DELETE FROM gold.mart_daily_scam_summary;
DELETE FROM gold.fact_scam_check;

-- Grain: one row per scam check. INNER JOINs to the dimensions: the gold check compares row counts
-- with silver afterwards, so a dropped row cannot go unnoticed.
INSERT INTO gold.fact_scam_check
  (check_id, date_key, channel_key, risk_level_key, scam_type, lang,
   risk, rules_risk, ai_risk, latency_ms, is_scam, is_simulated, feedback_correct)
SELECT
  s.check_id,
  CAST(DATE_FORMAT(s.checked_at, '%Y%m%d') AS UNSIGNED),
  ch.channel_key,
  rl.risk_level_key,
  s.scam_type,
  s.lang,
  s.risk, s.rules_risk, s.ai_risk, s.latency_ms,
  s.level <> 'safe',
  s.simulated,
  CASE s.feedback WHEN 'correct' THEN TRUE WHEN 'wrong' THEN FALSE END
FROM silver.scam_check s
JOIN gold.dim_channel    ch ON ch.code = s.kind
JOIN gold.dim_risk_level rl ON rl.code = s.level;

-- Grain: one row per (check, tactic).
INSERT INTO gold.bridge_check_tactic (check_key, tactic_key)
SELECT f.check_key, t.tactic_key
FROM silver.scam_check_tactic st
JOIN gold.fact_scam_check f ON f.check_id = st.check_id
JOIN gold.dim_tactic      t ON t.code     = st.tactic;

-- ---- Marts ------------------------------------------------------------------------------------

-- Question 2: how many checks and scams per day and channel?
INSERT INTO gold.mart_daily_scam_summary
  (date_key, channel_key, checks, scams, high_risk, avg_risk, feedback_correct, feedback_wrong)
SELECT
  f.date_key, f.channel_key,
  COUNT(*),
  SUM(f.is_scam),
  SUM(f.risk_level_key = 3),
  ROUND(AVG(f.risk), 3),
  SUM(f.feedback_correct <=> TRUE),
  SUM(f.feedback_correct <=> FALSE)
FROM gold.fact_scam_check f
GROUP BY f.date_key, f.channel_key;

-- Question 1: is this number a known scam number? One plain answer: Low / Medium / High.
--   High   = on the government list, or 10+ user reports
--   Medium = 3-9 user reports
--   Low    = 1-2 user reports
DELETE FROM gold.mart_number_risk;

INSERT INTO gold.mart_number_risk
  (phone_e164, gov_listed, gov_category, gov_report_count, user_report_count, risk_level_key)
SELECT
  n.phone_e164,
  g.phone_e164 IS NOT NULL,
  g.category,
  COALESCE(g.report_count, 0),
  COALESCE(u.reports, 0),
  rl.risk_level_key
FROM (SELECT phone_e164 FROM silver.gov_scam_number UNION SELECT phone_e164 FROM silver.user_report) n
LEFT JOIN silver.gov_scam_number g ON g.phone_e164 = n.phone_e164
LEFT JOIN (SELECT phone_e164, COUNT(*) AS reports FROM silver.user_report GROUP BY phone_e164) u ON u.phone_e164 = n.phone_e164
JOIN gold.dim_risk_level rl ON rl.code = CASE
    WHEN g.phone_e164 IS NOT NULL OR COALESCE(u.reports, 0) >= 10 THEN 'danger'
    WHEN COALESCE(u.reports, 0) >= 3 THEN 'caution'
    ELSE 'safe'
  END;

