-- Migration 008 — Anti-fraude
ALTER TABLE sales ADD COLUMN fraud_score INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN fraud_signals TEXT;
ALTER TABLE sales ADD COLUMN last_ip TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_ip ON sales(last_ip);
CREATE INDEX IF NOT EXISTS idx_sales_fraud ON sales(fraud_score);
