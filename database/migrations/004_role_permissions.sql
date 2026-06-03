-- Migration 004 — Permissoes por cargo do Discord (alem de por user)

CREATE TABLE IF NOT EXISTS role_permissions (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,                 -- Discord role ID
  role_name TEXT,                        -- cache pra UI
  permission TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 1,
  granted_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, role_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_role_perms_guild ON role_permissions(guild_id);
