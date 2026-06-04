-- Migration 018 — Mensagens automaticas (auto-messages) com Embed Builder

CREATE TABLE IF NOT EXISTS auto_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  content TEXT,                     -- texto acima do embed (opcional)
  mode TEXT NOT NULL DEFAULT 'embed', -- embed | components_v2 | legacy
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  embed_json TEXT,                  -- JSON do embed (color/author/title/desc/fields/image/footer/buttons)
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sent_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_auto_messages_guild ON auto_messages(guild_id);
