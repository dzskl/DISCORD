-- Webhook signing v3: cada vendedor (ou todo o sistema) tem keypair
-- ed25519. Assinatura usa private key; vendedor verifica com public key
-- (publicada num endpoint, sem precisar guardar secret).
--
-- Vantagem sobre HMAC:
--   - Vendedor nao precisa guardar shared secret seguro
--   - Public key pode ser cacheada/CDN
--   - Rotacao mais simples (publica nova public key)
--
-- Por enquanto: 1 keypair global do BotDash. Pra per-tenant viraria
-- coluna em outbound_webhooks.

CREATE TABLE IF NOT EXISTS signing_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kid TEXT NOT NULL UNIQUE,              -- key id (publicado, ex bd_2026_06)
  algorithm TEXT NOT NULL DEFAULT 'ed25519',
  public_key TEXT NOT NULL,              -- base64
  private_key TEXT NOT NULL,             -- base64 (encrypted-at-rest seria ideal)
  active INTEGER NOT NULL DEFAULT 1,
  rotated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_signing_active ON signing_keys(active);
