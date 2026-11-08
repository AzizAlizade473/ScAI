-- =====================================================================================
-- BRONZE: raw data exactly as received. Never edited, only appended.
-- "Keep raw untouched: store exactly what you received. Every later layer can be rebuilt from it."
-- Everything a source sends lands here first; typing and cleaning happen in silver.
-- =====================================================================================
CREATE DATABASE IF NOT EXISTS bronze CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bronze;

-- Raw landing: one row per file (inbox) or API page, with its content as received.
-- The same content twice is landed once (sha256 is unique), so re-running "fetch" is safe.
CREATE TABLE landed_file (
  file_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source        VARCHAR(40)     NOT NULL,                      -- gov_inbox | gov_api
  name          VARCHAR(500)    NOT NULL,                      -- file name or API URL
  format        ENUM('csv','json') NOT NULL,
  sha256        CHAR(64)        NOT NULL,
  byte_size     INT UNSIGNED    NOT NULL,
  expected_rows INT UNSIGNED    NOT NULL,                      -- data rows counted on arrival (bronze check)
  content       LONGTEXT        NOT NULL,                      -- the bytes as received
  skip          BOOLEAN         NOT NULL DEFAULT FALSE,        -- set to TRUE by hand to ignore a broken file
  run_id        BIGINT UNSIGNED NOT NULL,                      -- ops.pipeline_run that landed it
  landed_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (file_id),
  UNIQUE KEY uq_landed_sha (sha256)
);

-- Bronze rows: one row per data line of a landed government file. All text on purpose:
-- "Bronze: text. Silver: int, numeric, date."
CREATE TABLE gov_scam_number (
  file_id           BIGINT UNSIGNED NOT NULL,
  line_no           INT UNSIGNED    NOT NULL,                  -- position in the file (1 = first data row)
  phone_number      VARCHAR(255)    NULL,
  category          VARCHAR(255)    NULL,
  first_reported_at VARCHAR(255)    NULL,
  report_count      VARCHAR(255)    NULL,
  loaded_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (file_id, line_no),
  CONSTRAINT fk_gsn_file FOREIGN KEY (file_id) REFERENCES landed_file (file_id)
);

-- App extracts: one row per version of an app row, picked up by the watermark in ops.watermark.
-- Only the columns analytics needs are copied: never the message text.
CREATE TABLE app_event (
  event_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_table      VARCHAR(40)     NOT NULL,                  -- scam_check | check_feedback | scam_report
  source_id         CHAR(16)        NOT NULL,                  -- public id of the app row
  source_updated_at DATETIME(3)     NOT NULL,
  payload           JSON            NOT NULL,
  run_id            BIGINT UNSIGNED NOT NULL,
  loaded_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  UNIQUE KEY uq_app_event_version (source_table, source_id, source_updated_at)  -- re-runs add nothing twice
);
