-- Migration 020 — BIO rotativa do bot Discord

CREATE TABLE IF NOT EXISTS bot_bio_rotation (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,             -- 1 se ja pagou R$5
  statuses_json TEXT NOT NULL DEFAULT '[]',    -- ["texto1","texto2",...]
  interval_seconds INTEGER NOT NULL DEFAULT 30,
  current_index INTEGER NOT NULL DEFAULT 0,
  last_rotated_at INTEGER
);
