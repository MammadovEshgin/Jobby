-- D1 (SQLite) schema for vakansiya-bot.
-- Apply locally:  npm run db:apply:local
-- Apply to prod: npm run db:apply:remote

CREATE TABLE IF NOT EXISTS users (
  telegram_id  INTEGER PRIMARY KEY,
  username     TEXT,
  created_at   INTEGER NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1
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

-- Latest scrape, kept so /axtar can answer instantly instead of re-scraping
-- every source inside the webhook request. `seen_at` is the last time a source
-- still listed the vacancy, which is how we tell open postings from filled ones.
CREATE TABLE IF NOT EXISTS vacancy_snapshot (
  fingerprint  TEXT PRIMARY KEY,       -- sha256(normalize(title) | normalize(company))
  title        TEXT    NOT NULL,
  company      TEXT    NOT NULL,
  location     TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  source       TEXT    NOT NULL,
  posted_at    TEXT,
  seen_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacancy_snapshot_seen ON vacancy_snapshot(seen_at);
