-- Migration 021 — IA de Atendimento (Tickets)

CREATE TABLE IF NOT EXISTS support_ai_config (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  greeting TEXT,                       -- mensagem de boas-vindas no ticket
  faq_json TEXT NOT NULL DEFAULT '[]', -- [{q,a}]
  escalate_keywords TEXT,              -- CSV de palavras que mandam pra humano
  model TEXT DEFAULT 'simple',         -- simple | gpt
  signature TEXT
);

CREATE TABLE IF NOT EXISTS support_ai_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  ticket_id INTEGER,
  question TEXT,
  answer TEXT,
  matched_faq INTEGER,
  escalated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_guild ON support_ai_interactions(guild_id);
