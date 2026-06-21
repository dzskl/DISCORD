-- API keys publicas + outbound webhooks (vendedor recebe POST nosso quando
-- algo acontece na sua loja).

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT,                         -- null = vale pra todas guilds do user
  key_prefix TEXT NOT NULL,              -- ex bd_a1b2 (visivel, usado pra lookup)
  key_hash TEXT NOT NULL,                -- sha256 do token completo
  label TEXT,                            -- nome amigavel definido pelo user
  scopes TEXT,                           -- JSON array: ['read:sales','write:refund',...]
  active INTEGER NOT NULL DEFAULT 1,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER                     -- opcional, null = nao expira
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, active);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT,
  url TEXT NOT NULL,                     -- endpoint do vendedor
  secret TEXT NOT NULL,                  -- HMAC-SHA256 sobre o body
  events TEXT NOT NULL,                  -- JSON: ['sale.paid','sale.refunded','sale.med_returned']
  active INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,    -- contador de falhas consecutivas
  disabled_at INTEGER,                          -- timestamp se foi auto-desabilitado
  last_success_at INTEGER,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_outbound_user ON outbound_webhooks(user_id, active);

CREATE TABLE IF NOT EXISTS outbound_webhook_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL REFERENCES outbound_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  error TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  succeeded INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_outbound_attempts_wh ON outbound_webhook_attempts(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_attempts_failed
  ON outbound_webhook_attempts(succeeded, created_at)
  WHERE succeeded = 0;
