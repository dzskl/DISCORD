-- Migration 006 — Conquistas (premiacoes por marcos)

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT,
  kind TEXT NOT NULL,                    -- volume|sales_count|members|streak|first_sale
  tier TEXT NOT NULL,                    -- bronze|prata|ouro|platina|diamante|cristal
  threshold_cents INTEGER,               -- valor que disparou (pra volume)
  threshold_count INTEGER,               -- contagem (sales/members)
  metadata TEXT,                         -- JSON livre
  unlocked_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(user_id, kind, tier)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
