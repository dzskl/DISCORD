-- Maintenance mode + outras config flags globais que admin pode toggle
-- sem deploy.

CREATE TABLE IF NOT EXISTS system_flags (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_by TEXT
);
