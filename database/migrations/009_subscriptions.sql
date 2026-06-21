-- Migration 009 — assinaturas recorrentes pro cliente final.
-- Diferente de billing (que e o plano do owner): aqui o COMPRADOR final
-- assina um produto recorrente do owner (ex: cargo VIP R$30/mes).

ALTER TABLE products ADD COLUMN is_subscription INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN subscription_interval TEXT;          -- month|year
ALTER TABLE products ADD COLUMN stripe_price_id TEXT;                -- price recorrente Stripe

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  guild_id TEXT,
  discord_id TEXT NOT NULL,
  discord_tag TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',       -- active|past_due|canceled|incomplete
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cust_subs_discord ON customer_subscriptions(discord_id);
CREATE INDEX IF NOT EXISTS idx_cust_subs_status ON customer_subscriptions(status);
