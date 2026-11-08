-- =====================================================================================
-- OPS: the pipeline's checkpoints and its record of what happened.
--   pipeline_run / step_run : every run and every step, with status, rows and errors
--   watermark               : the high-water mark already loaded from each source
--   dq_check                : the quality gate result for each layer, per run
-- =====================================================================================
CREATE DATABASE IF NOT EXISTS ops CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE ops;

-- Grain: one row per pipeline run.
CREATE TABLE pipeline_run (
  run_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steps       VARCHAR(200)    NOT NULL,                        -- which steps this run was asked to do
  status      ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  failed_step VARCHAR(40)     NULL,
  error       TEXT            NULL,
  started_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3)     NULL,
  PRIMARY KEY (run_id)
);

-- Grain: one row per step of a run.
CREATE TABLE step_run (
  run_id      BIGINT UNSIGNED NOT NULL,
  step        VARCHAR(40)     NOT NULL,
  status      ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  rows_written INT UNSIGNED   NULL,
  message     TEXT            NULL,
  started_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3)     NULL,
  PRIMARY KEY (run_id, step),
  CONSTRAINT fk_step_run FOREIGN KEY (run_id) REFERENCES pipeline_run (run_id)
);

-- Checkpoint: the high-water mark already loaded from each app table (max updated_at).
-- "Store it, read it, move it." It only moves forward, in the same transaction as the load.
CREATE TABLE watermark (
  source     VARCHAR(60)     NOT NULL,                         -- e.g. app.scam_check
  high_water DATETIME(3)     NOT NULL,
  run_id     BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source)
);

-- Checkpoint: data quality gates between layers. bad_rows > 0 -> the step fails and the run stops.
CREATE TABLE dq_check (
  run_id     BIGINT UNSIGNED NOT NULL,
  layer      ENUM('raw','bronze','silver','gold') NOT NULL,
  check_name VARCHAR(80)     NOT NULL,
  bad_rows   INT UNSIGNED    NOT NULL,
  passed     BOOLEAN         NOT NULL,
  checked_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (run_id, check_name),
  CONSTRAINT fk_dq_run FOREIGN KEY (run_id) REFERENCES pipeline_run (run_id)
);
