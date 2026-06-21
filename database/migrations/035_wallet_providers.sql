-- Wallet v1: extende `sales` pra rastrear qual PSP processou cada venda.
-- Modelo intermediario: o pagamento cai direto na conta da PSP do vendedor;
-- BotDash so registra o id externo pra reconciliacao + idempotencia.

ALTER TABLE sales ADD COLUMN provider              TEXT;
ALTER TABLE sales ADD COLUMN provider_charge_id    TEXT;
ALTER TABLE sales ADD COLUMN provider_pay_currency TEXT;     -- ex: 'usdttrc20', 'BRL', 'BTC'
ALTER TABLE sales ADD COLUMN provider_expires_at   INTEGER;  -- unix ts da cobranca
ALTER TABLE sales ADD COLUMN provider_raw          TEXT;     -- ultima resposta crua (debug)

-- Idempotencia: nao deixa criar duas sales pro mesmo (provider, charge_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_provider_charge
  ON sales(provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_provider_status
  ON sales(provider, status);
