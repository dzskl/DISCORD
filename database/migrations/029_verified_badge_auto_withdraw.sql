-- Migration 029 — Selo Verificado pago + flag de saque automatico

-- Selo "Verificado" mensal exibido na vitrine. Receita recorrente.
ALTER TABLE users ADD COLUMN verified_badge_until INTEGER;
ALTER TABLE users ADD COLUMN verified_badge_started_at INTEGER;

CREATE TABLE IF NOT EXISTS verified_badge_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  price_cents INTEGER NOT NULL,
  months INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  paid_via TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_badge_user ON verified_badge_payments(user_id, created_at DESC);

-- Saque automatico opt-in pra vendedores tier "established"
ALTER TABLE users ADD COLUMN auto_withdraw_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN auto_withdraw_min_cents INTEGER DEFAULT 5000;  -- min R$ 50 pra acionar
