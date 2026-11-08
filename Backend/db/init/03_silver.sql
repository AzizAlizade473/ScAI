-- =====================================================================================
-- SILVER: typed, deduplicated, one convention.
-- Phone numbers in E.164 (+994...), risks as numbers, times as UTC DATETIME.
-- Rebuilt in full from bronze on every run, inside one transaction (idempotent).
-- =====================================================================================
CREATE DATABASE IF NOT EXISTS silver CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE silver;

-- Grain: one row per phone number on the government scam list.
CREATE TABLE gov_scam_number (
  phone_e164        VARCHAR(16)     NOT NULL,                  -- business key
  category          VARCHAR(30)     NOT NULL,                  -- lower-case code, 'unknown' when missing
  first_reported_at DATE            NULL,
  report_count      INT UNSIGNED    NOT NULL,
  file_id           BIGINT UNSIGNED NOT NULL,                  -- lineage: which landed file it came from
  PRIMARY KEY (phone_e164)
);

-- Grain: one row per scam check (latest version from bronze.app_event).
CREATE TABLE scam_check (
  check_id    CHAR(16)       NOT NULL,                         -- business key (app public id)
  kind        ENUM('message','voice','call') NOT NULL,
  lang        CHAR(2)        NULL,
  level       ENUM('safe','caution','danger') NOT NULL,
  risk        DECIMAL(4,3)   NOT NULL,
  rules_risk  DECIMAL(4,3)   NULL,
  ai_risk     DECIMAL(4,3)   NULL,
  scam_type   VARCHAR(30)    NOT NULL,                         -- 'none' when missing
  model       VARCHAR(60)    NULL,
  latency_ms  INT UNSIGNED   NULL,
  simulated   BOOLEAN        NOT NULL,
  feedback    ENUM('correct','wrong') NULL,
  checked_at  DATETIME(3)    NOT NULL,                         -- UTC
  PRIMARY KEY (check_id)
);

-- Grain: one row per (check, tactic).
CREATE TABLE scam_check_tactic (
  check_id CHAR(16)    NOT NULL,
  tactic   VARCHAR(30) NOT NULL,
  PRIMARY KEY (check_id, tactic)
);

-- Grain: one row per user report of a phone number.
CREATE TABLE user_report (
  report_id   CHAR(16)    NOT NULL,                            -- business key (app public id)
  phone_e164  VARCHAR(16) NOT NULL,
  reason      VARCHAR(30) NULL,
  reported_at DATETIME(3) NOT NULL,
  PRIMARY KEY (report_id),
  KEY ix_user_report_phone (phone_e164)
);

-- Typing rules for the government list, written once and used twice:
-- by pipeline/sql/silver.sql (keeps the valid rows) and by the silver quality check (counts the invalid ones).
-- Phone rules match Backend/app/phone.js.
CREATE VIEW v_gov_scam_number_typed AS
SELECT
  x.file_id,
  x.line_no,
  x.phone_e164,
  x.category,
  CASE WHEN x.date_ok THEN STR_TO_DATE(x.date_txt, '%Y-%m-%d') END                    AS first_reported_at,
  CASE WHEN x.count_txt = '' THEN 1 WHEN x.count_ok THEN CAST(x.count_txt AS UNSIGNED) END AS report_count,
  (x.phone_e164 IS NOT NULL
     AND (x.date_txt = '' OR x.date_ok)
     AND (x.count_txt = '' OR x.count_ok))                                             AS is_valid
FROM (
  SELECT
    b.file_id,
    b.line_no,
    CASE
      WHEN d REGEXP '^994[0-9]{9}$'      THEN CONCAT('+', d)
      WHEN d REGEXP '^00[0-9]{8,15}$'    THEN CONCAT('+', SUBSTRING(d, 3))
      WHEN d REGEXP '^0[0-9]{9}$'        THEN CONCAT('+994', SUBSTRING(d, 2))
      WHEN d REGEXP '^[0-9]{9}$'         THEN CONCAT('+994', d)
      WHEN p LIKE '+%' AND d REGEXP '^[0-9]{8,15}$' THEN CONCAT('+', d)
    END                                                                                  AS phone_e164,
    COALESCE(NULLIF(LEFT(LOWER(TRIM(b.category)), 30), ''), 'unknown')                   AS category,
    TRIM(COALESCE(b.first_reported_at, ''))                                              AS date_txt,
    CASE WHEN TRIM(COALESCE(b.first_reported_at, '')) REGEXP '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         THEN DAY(LAST_DAY(CONCAT(LEFT(TRIM(b.first_reported_at), 7), '-01'))) >= CAST(RIGHT(TRIM(b.first_reported_at), 2) AS UNSIGNED)
         ELSE FALSE END                                                                  AS date_ok,   -- CASE only checks real dates (no 2026-02-30)
    TRIM(COALESCE(b.report_count, ''))                                                   AS count_txt,
    TRIM(COALESCE(b.report_count, '')) REGEXP '^[0-9]{1,9}$'                             AS count_ok
  FROM (
    SELECT g.*, TRIM(COALESCE(g.phone_number, '')) AS p, REGEXP_REPLACE(COALESCE(g.phone_number, ''), '[^0-9]', '') AS d
    FROM bronze.gov_scam_number g
    JOIN bronze.landed_file f ON f.file_id = g.file_id AND NOT f.skip
  ) b
) x;
