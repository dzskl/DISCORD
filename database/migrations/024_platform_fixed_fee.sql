-- Migration 024 — Taxa fixa por venda (R$ 0,99 padrao)
-- Cobre custo de processamento em vendas de ticket baixo onde o % sozinho nao paga a operacao.

ALTER TABLE sales ADD COLUMN platform_fixed_fee_cents INTEGER DEFAULT 0;

-- Vendas antigas: marca como 0 (nao retroage)
UPDATE sales SET platform_fixed_fee_cents = 0 WHERE platform_fixed_fee_cents IS NULL;
