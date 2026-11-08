-- =====================================================================================
-- APP: the source system (OLTP). The Scam Guardian server reads and writes these tables.
-- Built in 3NF: every fact is stored once, so writes are safe and simple.
-- "3NF is built for writing safely; a star schema for reading fast." (gold.* is the star.)
-- All times are UTC. Runs once, on the first `docker compose up` (empty volume).
-- =====================================================================================
CREATE DATABASE IF NOT EXISTS app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE app;

-- A protected person (usually an older adult).
-- Not written by the server yet: the app has no accounts today. Ready for when it does.
CREATE TABLE app_user (
  user_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,        -- surrogate key
  public_id    CHAR(16)        NOT NULL,                       -- id the client sees
  display_name VARCHAR(80)     NOT NULL,
  phone_e164   VARCHAR(16)     NOT NULL,                       -- business key, e.g. +994501234567
  language     ENUM('az','ru','en') NOT NULL DEFAULT 'az',
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_user_public (public_id),
  UNIQUE KEY uq_user_phone (phone_e164)
);

-- A family member who is alerted when there is danger ("trusted person" in the app).
-- 1 : N  -> one user has zero or more trusted contacts; the FK sits on the "many" side.
CREATE TABLE trusted_contact (
  contact_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  display_name     VARCHAR(80)     NOT NULL,
  phone_e164       VARCHAR(16)     NOT NULL,
  relation         VARCHAR(20)     NOT NULL DEFAULT 'child',   -- child | spouse | grandchild | friend (same codes as the app)
  notify_on_danger BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (contact_id),
  UNIQUE KEY uq_contact (user_id, phone_e164),
  CONSTRAINT fk_contact_user FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE
);

-- One scam check: a checked message/link, a spoken check, or a finished (simulated) call.
-- This replaces data/store.json "history" when the server runs with MySQL.
CREATE TABLE scam_check (
  check_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,       -- surrogate key
  public_id     CHAR(16)        NOT NULL,                      -- 16 hex chars, same format as the JSON store
  user_id       BIGINT UNSIGNED NULL,                          -- NULL until the app has accounts
  kind          ENUM('message','voice','call') NOT NULL,
  source        VARCHAR(20)     NOT NULL DEFAULT 'check',
  lang          CHAR(2)         NULL,
  text_redacted VARCHAR(1000)   NULL,                          -- already redacted by the server; NULL for calls
  level         ENUM('safe','caution','danger') NOT NULL,
  risk          DECIMAL(4,3)    NOT NULL,                      -- 0.000 .. 1.000
  rules_risk    DECIMAL(4,3)    NULL,
  ai_risk       DECIMAL(4,3)    NULL,
  scam_type     VARCHAR(30)     NULL,                          -- fake_bank, fake_relative, ... (scam-check.js)
  reason_az     VARCHAR(500)    NULL,                          -- 1NF: one value per cell, so one column per language
  reason_ru     VARCHAR(500)    NULL,
  reason_en     VARCHAR(500)    NULL,
  model         VARCHAR(60)     NULL,
  latency_ms    INT UNSIGNED    NULL,
  simulated     BOOLEAN         NOT NULL DEFAULT FALSE,        -- calls only from here down
  scenario      VARCHAR(40)     NULL,
  number_masked VARCHAR(16)     NULL,                          -- "•••• 7731", never the full number
  duration_sec  INT UNSIGNED    NULL,
  stt_lines     INT UNSIGNED    NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (check_id),
  UNIQUE KEY uq_check_public (public_id),
  KEY ix_check_created (created_at),
  KEY ix_check_updated (updated_at),                           -- the pipeline's watermark reads this
  CONSTRAINT chk_check_risk CHECK (risk BETWEEN 0 AND 1),
  CONSTRAINT fk_check_user FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE SET NULL
);

-- Lookup of scam tactics (otp_request, card_request, ...). Same codes as rules.js.
CREATE TABLE tactic (
  tactic     VARCHAR(30) NOT NULL,
  label_en   VARCHAR(60) NOT NULL,
  severity   ENUM('danger','caution','weak','info','unknown') NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (tactic)
);
INSERT INTO tactic (tactic, label_en, severity) VALUES
  ('otp_request',     'OTP / PIN request',           'danger'),
  ('remote_access',   'Remote-access app',           'danger'),
  ('safe_account',    '"Safe account" transfer',     'danger'),
  ('card_request',    'Card details request',        'caution'),
  ('money_transfer',  'Money transfer request',      'caution'),
  ('prize_fee',       'Prize or upfront fee',        'caution'),
  ('investment',      'Guaranteed-profit promise',   'caution'),
  ('suspicious_link', 'Suspicious link',             'caution'),
  ('impersonation',   'Claims to be an institution', 'weak'),
  ('urgency',         'Urgency / pressure',          'weak'),
  ('secrecy',         'Asks for secrecy',            'weak'),
  ('safety_advice',   'Safety advice',               'info');

-- M : N  -> a check shows many tactics, a tactic appears in many checks.
-- One column cannot hold a list (1NF), so this bridge table holds one row per (check, tactic).
CREATE TABLE scam_check_tactic (
  check_id BIGINT UNSIGNED NOT NULL,
  tactic   VARCHAR(30)     NOT NULL,
  PRIMARY KEY (check_id, tactic),
  CONSTRAINT fk_sct_check  FOREIGN KEY (check_id) REFERENCES scam_check (check_id) ON DELETE CASCADE,
  CONSTRAINT fk_sct_tactic FOREIGN KEY (tactic)   REFERENCES tactic (tactic)
);

-- 1 : 1 (0..1) -> a check has at most one "was this right?" answer from the user.
-- The primary key is also the foreign key, which is what makes it one-to-one.
CREATE TABLE check_feedback (
  check_id   BIGINT UNSIGNED NOT NULL,
  public_id  CHAR(16)        NOT NULL,
  verdict    ENUM('correct','wrong') NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (check_id),
  UNIQUE KEY uq_feedback_public (public_id),
  KEY ix_feedback_updated (updated_at),
  CONSTRAINT fk_feedback_check FOREIGN KEY (check_id) REFERENCES scam_check (check_id) ON DELETE CASCADE
);

-- A user reports a phone number as a scam. These reports grow our own scam-number list
-- next to the government list (see gold.mart_number_risk).
CREATE TABLE scam_report (
  report_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id  CHAR(16)        NOT NULL,
  phone_e164 VARCHAR(16)     NOT NULL,
  user_id    BIGINT UNSIGNED NULL,
  check_id   BIGINT UNSIGNED NULL,                             -- the call or message it came from, if any
  reason     VARCHAR(30)     NULL,                             -- optional scam type code
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (report_id),
  UNIQUE KEY uq_report_public (public_id),
  KEY ix_report_phone (phone_e164),
  KEY ix_report_updated (updated_at),
  CONSTRAINT fk_report_user  FOREIGN KEY (user_id)  REFERENCES app_user (user_id)    ON DELETE SET NULL,
  CONSTRAINT fk_report_check FOREIGN KEY (check_id) REFERENCES scam_check (check_id) ON DELETE SET NULL
);
