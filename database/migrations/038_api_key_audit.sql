-- Audit log de uso das API keys: cada request via Bearer eh registrada
-- Util pra observabilidade, debug e investigacao de abuse.

CREATE TABLE IF NOT EXISTS api_key_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  method TEXT NOT NULL,                -- GET, POST, PUT, DELETE
  path TEXT NOT NULL,
  status_code INTEGER,
  ip TEXT,
  user_agent TEXT,
  test_mode INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_api_key_audit_key
  ON api_key_audit(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_user
  ON api_key_audit(user_id, created_at DESC);
