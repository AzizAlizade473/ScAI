-- =====================================================================================
-- GOLD: shaped for the questions. A star schema (facts in the middle, dimensions around)
-- plus two small marts the app and a dashboard read directly.
--
-- The questions (we worked backwards from them):
--   1. "Is this caller's number a known scam number?"  -> mart_number_risk  (Low / Medium / High)
--   2. "How many scams did we catch, per day and channel, with which tactics?" -> fact_scam_check
-- =====================================================================================
CREATE DATABASE IF NOT EXISTS gold CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE gold;

-- ---------- Dimensions (few rows, descriptions). Updated in place = SCD Type 1. ----------

-- when. Grain: one row per calendar day. date_key = yyyymmdd, e.g. 20261108.
CREATE TABLE dim_date (
  date_key   INT UNSIGNED NOT NULL,
  full_date  DATE         NOT NULL,
  year       SMALLINT     NOT NULL,
  month      TINYINT      NOT NULL,
  day        TINYINT      NOT NULL,
  weekday    VARCHAR(9)   NOT NULL,
  is_weekend BOOLEAN      NOT NULL,
  PRIMARY KEY (date_key),
  UNIQUE KEY uq_dim_date (full_date)
);

-- how the check came in. Grain: one row per channel.
CREATE TABLE dim_channel (
  channel_key TINYINT UNSIGNED NOT NULL,
  code        VARCHAR(10)      NOT NULL,
  label       VARCHAR(40)      NOT NULL,
  PRIMARY KEY (channel_key),
  UNIQUE KEY uq_dim_channel (code)
);
INSERT INTO dim_channel VALUES
  (1, 'message', 'Message or link'),
  (2, 'voice',   'Spoken check'),
  (3, 'call',    'Phone call');

-- the plain-language answer. Grain: one row per risk level.
CREATE TABLE dim_risk_level (
  risk_level_key TINYINT UNSIGNED NOT NULL,
  code           VARCHAR(10)      NOT NULL,                    -- level used by the app
  label          VARCHAR(10)      NOT NULL,                    -- what a person reads
  min_risk       DECIMAL(4,3)     NOT NULL,
  max_risk       DECIMAL(4,3)     NOT NULL,
  advice_en      VARCHAR(120)     NOT NULL,
  PRIMARY KEY (risk_level_key),
  UNIQUE KEY uq_dim_risk_level (code)
);
INSERT INTO dim_risk_level VALUES
  (1, 'safe',    'Low',    0.000, 0.449, 'Low risk. Stay alert and never share codes.'),
  (2, 'caution', 'Medium', 0.450, 0.799, 'Be careful. Do not share codes, card details or money.'),
  (3, 'danger',  'High',   0.800, 1.000, 'Do not share anything. Hang up and call your bank or family yourself.');

-- what the scammer did. Grain: one row per tactic.
CREATE TABLE dim_tactic (
  tactic_key SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,        -- surrogate key
  code       VARCHAR(30)       NOT NULL,                       -- business key
  label      VARCHAR(60)       NOT NULL,
  severity   VARCHAR(10)       NOT NULL,
  PRIMARY KEY (tactic_key),
  UNIQUE KEY uq_dim_tactic (code)
);

-- ---------- Facts (many rows, measurements). Rebuilt in full on every run. ----------

-- Grain: one row per scam check (message, voice check or call).
CREATE TABLE fact_scam_check (
  check_key        BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,   -- surrogate key
  check_id         CHAR(16)         NOT NULL,                  -- business key from the app
  date_key         INT UNSIGNED     NOT NULL,
  channel_key      TINYINT UNSIGNED NOT NULL,
  risk_level_key   TINYINT UNSIGNED NOT NULL,
  scam_type        VARCHAR(30)      NOT NULL,                  -- degenerate dimension
  lang             CHAR(2)          NULL,
  risk             DECIMAL(4,3)     NOT NULL,                  -- measures from here down
  rules_risk       DECIMAL(4,3)     NULL,
  ai_risk          DECIMAL(4,3)     NULL,
  latency_ms       INT UNSIGNED     NULL,
  is_scam          BOOLEAN          NOT NULL,                  -- level is caution or danger
  is_simulated     BOOLEAN          NOT NULL,
  feedback_correct BOOLEAN          NULL,                      -- NULL = no feedback given
  PRIMARY KEY (check_key),
  UNIQUE KEY uq_fact_check (check_id),
  CONSTRAINT fk_fsc_date    FOREIGN KEY (date_key)       REFERENCES dim_date (date_key),
  CONSTRAINT fk_fsc_channel FOREIGN KEY (channel_key)    REFERENCES dim_channel (channel_key),
  CONSTRAINT fk_fsc_risk    FOREIGN KEY (risk_level_key) REFERENCES dim_risk_level (risk_level_key)
);

-- Bridge, grain: one row per (check, tactic). Turns the M:N into two 1:N links.
CREATE TABLE bridge_check_tactic (
  check_key  BIGINT UNSIGNED   NOT NULL,
  tactic_key SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (check_key, tactic_key),
  CONSTRAINT fk_bct_check  FOREIGN KEY (check_key)  REFERENCES fact_scam_check (check_key),
  CONSTRAINT fk_bct_tactic FOREIGN KEY (tactic_key) REFERENCES dim_tactic (tactic_key)
);

-- ---------- Marts (one table per question, read directly by the app / a dashboard) ----------

-- Grain: one row per day and channel.
CREATE TABLE mart_daily_scam_summary (
  date_key         INT UNSIGNED     NOT NULL,
  channel_key      TINYINT UNSIGNED NOT NULL,
  checks           INT UNSIGNED     NOT NULL,
  scams            INT UNSIGNED     NOT NULL,
  high_risk        INT UNSIGNED     NOT NULL,
  avg_risk         DECIMAL(4,3)     NOT NULL,
  feedback_correct INT UNSIGNED     NOT NULL,
  feedback_wrong   INT UNSIGNED     NOT NULL,
  PRIMARY KEY (date_key, channel_key),
  CONSTRAINT fk_mds_date    FOREIGN KEY (date_key)    REFERENCES dim_date (date_key),
  CONSTRAINT fk_mds_channel FOREIGN KEY (channel_key) REFERENCES dim_channel (channel_key)
);

-- Grain: one row per phone number that is on the government list or was reported by a user.
-- Rule (README): High = on the government list or 10+ user reports; Medium = 3-9 reports; Low = 1-2.
CREATE TABLE mart_number_risk (
  phone_e164        VARCHAR(16)      NOT NULL,
  gov_listed        BOOLEAN          NOT NULL,
  gov_category      VARCHAR(30)      NULL,
  gov_report_count  INT UNSIGNED     NOT NULL,
  user_report_count INT UNSIGNED     NOT NULL,
  risk_level_key    TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (phone_e164),
  CONSTRAINT fk_mnr_risk FOREIGN KEY (risk_level_key) REFERENCES dim_risk_level (risk_level_key)
);
