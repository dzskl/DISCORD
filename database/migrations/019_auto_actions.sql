-- Migration 019 — Acoes Automaticas: reacoes, repostagem, limpeza, sugestoes

CREATE TABLE IF NOT EXISTS auto_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  emojis_json TEXT NOT NULL,           -- JSON ["👍","❤️",...]
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_auto_reactions_guild ON auto_reactions(guild_id);

CREATE TABLE IF NOT EXISTS auto_cleanups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  clear_on_lock INTEGER NOT NULL DEFAULT 0,
  lock_time TEXT DEFAULT '22:00',
  unlock_time TEXT DEFAULT '08:00',
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_auto_cleanups_guild ON auto_cleanups(guild_id);
