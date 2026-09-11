-- D1 (SQLite) schema for vakansiya-bot.
-- Apply locally:  npm run db:apply:local
-- Apply to prod: npm run db:apply:remote

CREATE TABLE IF NOT EXISTS users (
  telegram_id  INTEGER PRIMARY KEY,
  username     TEXT,
  created_at   INTEGER NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  search_mode  TEXT    NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS user_fields (
  telegram_id  INTEGER NOT NULL,
  field        TEXT    NOT NULL,        -- normalized form, used for matching
  raw_field    TEXT    NOT NULL,        -- exact text the user typed (for display)
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (telegram_id, field),
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sent_vacancies (
  fingerprint  TEXT    NOT NULL,        -- sha256(normalize(title) | normalize(company))
  telegram_id  INTEGER NOT NULL,
  first_seen   INTEGER NOT NULL,
  source       TEXT    NOT NULL,        -- which scraper found it first
  PRIMARY KEY (fingerprint, telegram_id),
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sent_first_seen ON sent_vacancies(first_seen);
CREATE INDEX IF NOT EXISTS idx_user_fields_tg  ON user_fields(telegram_id);

-- Per-user rate limiting for /axtar (manual search).
-- Stored in DB rather than KV so it survives across worker invocations
-- without adding a KV namespace just for this.
CREATE TABLE IF NOT EXISTS manual_search_log (
  telegram_id  INTEGER PRIMARY KEY,
  last_run_at  INTEGER NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);
