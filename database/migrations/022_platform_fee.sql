-- Migration 022 — Taxa da plataforma (6.5%) por venda

ALTER TABLE sales ADD COLUMN platform_fee_cents INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN platform_fee_rate REAL DEFAULT 0.065;
ALTER TABLE sales ADD COLUMN net_to_owner_cents INTEGER DEFAULT 0;

-- Backfill: marca vendas pagas anteriores com 0 fee (compat — nao retroage)
UPDATE sales SET platform_fee_cents = 0, platform_fee_rate = 0, net_to_owner_cents = amount_cents
WHERE platform_fee_cents IS NULL;
