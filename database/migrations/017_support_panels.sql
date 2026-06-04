-- Migration 017 — Paineis de Suporte (Tickets)

CREATE TABLE IF NOT EXISTS support_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  posted_channel_id TEXT,
  posted_message_id TEXT,
  schedule_start TEXT,                -- HH:MM
  schedule_end TEXT,                  -- HH:MM
  schedule_days TEXT,                 -- JSON ["seg","ter",...]
  embed_color TEXT DEFAULT '#5865F2',
  embed_title TEXT,
  embed_description TEXT,
  embed_footer TEXT,
  embed_image_url TEXT,
  functions_json TEXT,                -- JSON array de {label, emoji, category, role_required}
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_panels_guild ON support_panels(guild_id);
