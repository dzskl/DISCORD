-- Migration 005 — Multi-bot por conta.
-- Cada user pode ter N bots (instances). Cada uma com creds proprios e
-- vinculo a uma guild principal. A "active" da sessao define qual o
-- contexto ativo no dashboard.

CREATE TABLE IF NOT EXISTS bot_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  discord_client_id TEXT,
  -- Token encriptado guardado em credentials(scope='bot:<id>') — nao guarda
  -- texto plano aqui. Esta coluna fica null e o token vem do credential store.
  status TEXT NOT NULL DEFAULT 'inactive',  -- active|inactive|error
  primary_guild_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  trial_ends_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_bot_instances_owner ON bot_instances(owner_user_id);

-- Backfill: cria uma bot_instance "default" pro owner com a guild legacy
-- (so se houver guilds e users — senao o backfill em runtime fara isso)
