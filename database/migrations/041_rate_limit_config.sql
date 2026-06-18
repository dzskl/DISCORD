-- Permite admin sobrescrever rate limits por endpoint sem deploy.
-- route = chave do endpoint (ex: 'wallet:sales'). capacity / window_ms.
-- Se nao houver row, usa os defaults hardcoded em app.js.

CREATE TABLE IF NOT EXISTS rate_limit_config (
  route TEXT PRIMARY KEY,                  -- ex 'wallet:sales', 'wallet:refund'
  capacity INTEGER NOT NULL,
  window_ms INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_by TEXT
);
