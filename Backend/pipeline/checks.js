// Quality gates: "check every layer". Each query returns the number of bad rows.
// After a step runs, its checks run. Any bad row -> the step fails -> the pipeline stops.
// Results are kept in ops.dq_check. "Fail fast and loudly: catch bad data where it enters a layer."
'use strict';

module.exports = {
  fetch_gov: [
    ['raw', 'raw.landed_files_not_empty',
      `SELECT COUNT(*) FROM bronze.landed_file WHERE NOT skip AND byte_size = 0`]
  ],

  extract_app: [
    // Completeness: every app row up to the watermark has its current version in bronze.
    ['raw', 'raw.app_rows_all_extracted',
      `SELECT
         (SELECT COUNT(*) FROM app.scam_check c
           WHERE c.updated_at <= COALESCE((SELECT high_water FROM ops.watermark WHERE source = 'app.scam_check'), '1970-01-01')
             AND NOT EXISTS (SELECT 1 FROM bronze.app_event e WHERE e.source_table = 'scam_check' AND e.source_id = c.public_id AND e.source_updated_at = c.updated_at))
       + (SELECT COUNT(*) FROM app.check_feedback f
           WHERE f.updated_at <= COALESCE((SELECT high_water FROM ops.watermark WHERE source = 'app.check_feedback'), '1970-01-01')
             AND NOT EXISTS (SELECT 1 FROM bronze.app_event e WHERE e.source_table = 'check_feedback' AND e.source_id = f.public_id AND e.source_updated_at = f.updated_at))
       + (SELECT COUNT(*) FROM app.scam_report r
           WHERE r.updated_at <= COALESCE((SELECT high_water FROM ops.watermark WHERE source = 'app.scam_report'), '1970-01-01')
             AND NOT EXISTS (SELECT 1 FROM bronze.app_event e WHERE e.source_table = 'scam_report' AND e.source_id = r.public_id AND e.source_updated_at = r.updated_at))`]
  ],

  load_bronze: [
    ['bronze', 'bronze.row_count_matches_raw',
      `SELECT COUNT(*) FROM bronze.landed_file f
         LEFT JOIN (SELECT file_id, COUNT(*) AS n FROM bronze.gov_scam_number GROUP BY file_id) r ON r.file_id = f.file_id
        WHERE NOT f.skip AND f.expected_rows <> COALESCE(r.n, 0)`]
  ],

  silver: [
    ['silver', 'silver.gov_rows_typed',              // phone, date and count must all parse
      `SELECT COUNT(*) FROM silver.v_gov_scam_number_typed WHERE NOT is_valid`],
    ['silver', 'silver.gov_no_null_or_duplicate_keys',
      `SELECT (SELECT COUNT(*) FROM silver.gov_scam_number WHERE phone_e164 IS NULL)
            + (SELECT COUNT(*) FROM (SELECT phone_e164 FROM silver.gov_scam_number GROUP BY phone_e164 HAVING COUNT(*) > 1) d)`],
    ['silver', 'silver.gov_values_in_range',
      `SELECT COUNT(*) FROM silver.gov_scam_number
        WHERE report_count > 10000000 OR first_reported_at > UTC_DATE() + INTERVAL 1 DAY OR phone_e164 NOT REGEXP '^[+][0-9]{8,15}$'`],
    ['silver', 'silver.check_no_null_or_duplicate_keys',
      `SELECT (SELECT COUNT(*) FROM silver.scam_check WHERE check_id IS NULL)
            + (SELECT COUNT(*) FROM (SELECT check_id FROM silver.scam_check GROUP BY check_id HAVING COUNT(*) > 1) d)`],
    ['silver', 'silver.check_values_in_range',
      `SELECT COUNT(*) FROM silver.scam_check
        WHERE risk IS NULL OR risk NOT BETWEEN 0 AND 1 OR rules_risk NOT BETWEEN 0 AND 1 OR ai_risk NOT BETWEEN 0 AND 1
           OR checked_at IS NULL OR checked_at > UTC_TIMESTAMP(3) + INTERVAL 1 DAY`],
    ['silver', 'silver.check_rows_match_bronze',     // no check lost on the way
      `SELECT ABS((SELECT COUNT(DISTINCT source_id) FROM bronze.app_event WHERE source_table = 'scam_check')
                - (SELECT COUNT(*) FROM silver.scam_check))`],
    ['silver', 'silver.report_rows_valid',
      `SELECT ABS((SELECT COUNT(DISTINCT source_id) FROM bronze.app_event WHERE source_table = 'scam_report')
                - (SELECT COUNT(*) FROM silver.user_report))
            + (SELECT COUNT(*) FROM silver.user_report WHERE phone_e164 IS NULL OR phone_e164 NOT REGEXP '^[+][0-9]{8,15}$')`]
  ],

  gold: [
    ['gold', 'gold.fact_rows_reconcile_with_silver',
      `SELECT ABS((SELECT COUNT(*) FROM gold.fact_scam_check) - (SELECT COUNT(*) FROM silver.scam_check))`],
    ['gold', 'gold.daily_totals_reconcile_with_silver',
      `SELECT ABS(COALESCE((SELECT SUM(checks) FROM gold.mart_daily_scam_summary), 0) - (SELECT COUNT(*) FROM silver.scam_check))
            + ABS(COALESCE((SELECT SUM(scams) FROM gold.mart_daily_scam_summary), 0) - (SELECT COUNT(*) FROM silver.scam_check WHERE level <> 'safe'))`],
    ['gold', 'gold.tactic_links_reconcile_with_silver',
      `SELECT ABS((SELECT COUNT(*) FROM gold.bridge_check_tactic) - (SELECT COUNT(*) FROM silver.scam_check_tactic))`],
    ['gold', 'gold.number_risk_reconciles_with_silver',
      `SELECT ABS((SELECT COUNT(*) FROM gold.mart_number_risk WHERE gov_listed) - (SELECT COUNT(*) FROM silver.gov_scam_number))
            + ABS(COALESCE((SELECT SUM(user_report_count) FROM gold.mart_number_risk), 0) - (SELECT COUNT(*) FROM silver.user_report))`]
  ]
};
