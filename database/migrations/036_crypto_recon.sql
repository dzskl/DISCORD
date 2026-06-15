-- Reconciliacao on-chain pras sales cripto (NOWPayments).
-- recon_status: 'ok' | JSON com detalhes da divergencia
-- recon_checked_at: ultimo timestamp em que foi checada

ALTER TABLE sales ADD COLUMN recon_status     TEXT;
ALTER TABLE sales ADD COLUMN recon_checked_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_sales_recon
  ON sales(provider, recon_checked_at)
  WHERE provider = 'nowpayments';
