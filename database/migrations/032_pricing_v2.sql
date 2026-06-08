-- Migration 032 — Pricing v2: 4 tiers + branding obrigatorio no Free
-- Adiciona starter e scale como planos validos.

-- (planos sao definidos em src/config/plans.js, este migration so anota historico
-- e cria addon_purchases pra adicionais como dominio, webhooks, emails)

CREATE TABLE IF NOT EXISTS addon_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  guild_id TEXT,
  addon TEXT NOT NULL,                -- domain | webhooks | emails | insurance
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | cancelled
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  paid_via TEXT,                       -- balance | stripe | pix
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_addon_user ON addon_purchases(user_id, status);
