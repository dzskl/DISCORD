-- Migration 027 — Antecipacao de recebiveis
-- Vendedor antecipa as vendas que ainda estao em hold pagando taxa fixa %.
-- A taxa eh debitada do valor antecipado; o restante eh liberado pra saque imediato.

CREATE TABLE IF NOT EXISTS advance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  guild_id TEXT,
  -- Valor bruto que estava em hold no momento da antecipacao
  gross_cents INTEGER NOT NULL,
  -- Taxa cobrada (2,99% padrao)
  fee_rate REAL NOT NULL,
  fee_cents INTEGER NOT NULL,
  -- Valor liberado pro vendedor (gross - fee)
  net_cents INTEGER NOT NULL,
  -- Status: applied = aplicado direto no saldo. cancelled = nao usado.
  status TEXT NOT NULL DEFAULT 'applied',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  -- IDs das sales que foram antecipadas (json array)
  sale_ids TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_advance_user ON advance_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advance_guild ON advance_requests(guild_id, created_at DESC);

-- Marca em sales as que ja foram antecipadas pra nao antecipar de novo
ALTER TABLE sales ADD COLUMN advance_request_id INTEGER REFERENCES advance_requests(id);
ALTER TABLE sales ADD COLUMN advanced_at INTEGER;
