-- Idempotency keys: deduplica requests POST que poderiam ter side-effects
-- multiplos (ex: refund repetido). Padrao Stripe-like.
--
-- Cliente passa header Idempotency-Key: <uuid>. Backend guarda a resposta
-- da primeira chamada por 24h e replays mesma resposta pra requests com
-- mesmo (user_id, key, route).

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  route TEXT NOT NULL,                  -- ex: POST:/api/checkout/wallet/refund/:id
  request_hash TEXT NOT NULL,            -- sha256(body) — se mudar, retorna 409
  status_code INTEGER NOT NULL,
  response_body TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_unique
  ON idempotency_keys(user_id, key, route);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys(expires_at);
