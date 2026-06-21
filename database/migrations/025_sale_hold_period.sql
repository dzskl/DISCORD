-- Migration 025 — Hold period escalonado por venda
-- available_at = timestamp em que o dinheiro fica liberado pra saque
-- hold_days = quantos dias de hold foram aplicados (snapshot)

ALTER TABLE sales ADD COLUMN available_at INTEGER;
ALTER TABLE sales ADD COLUMN hold_days INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN seller_tier TEXT;  -- 'new' | 'established'

-- Backfill: vendas pagas antigas ja sao consideradas liberadas
UPDATE sales
SET available_at = paid_at,
    hold_days = 0,
    seller_tier = 'established'
WHERE status = 'paid' AND available_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_available_at ON sales(available_at);
