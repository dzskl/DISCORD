-- Migration 028 — Destaque pago de produtos na loja
-- Vendedor paga pra ter o produto destacado por X dias na vitrine.
-- Receita 100% margem pra plataforma.

CREATE TABLE IF NOT EXISTS featured_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  guild_id TEXT,
  tier TEXT NOT NULL DEFAULT 'basic',   -- basic|premium|top
  price_cents INTEGER NOT NULL,
  days INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|expired|cancelled
  paid_via TEXT,                          -- balance|stripe|pix
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_featured_active ON featured_products(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_featured_product ON featured_products(product_id, status);

-- Flag rapida em products pra query da loja
ALTER TABLE products ADD COLUMN featured_until INTEGER;
ALTER TABLE products ADD COLUMN featured_tier TEXT;
