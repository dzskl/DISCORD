-- Migration 026 — Idempotencia de webhooks
-- Cada evento processado fica registrado pra evitar duplo-processamento.
-- gateway = 'misticpay' | 'stripe' (pra deixar generico)

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,         -- id unico do evento no gateway
  event_type TEXT,                 -- ex: payment.approved, payment.refunded
  transaction_id TEXT,             -- tx do gateway pra reconciliacao
  sale_id INTEGER,                 -- nossa sale ligada (apos resolver)
  payload TEXT,                    -- json bruto do payload (auditoria)
  signature_ok INTEGER,            -- 1 se HMAC validou, 0 se rejeitado, NULL se nao havia
  status TEXT NOT NULL DEFAULT 'received',  -- received|processed|failed|duplicate
  error TEXT,
  received_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  processed_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_event_unique ON webhook_events(gateway, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_tx ON webhook_events(gateway, transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhook_received ON webhook_events(received_at DESC);
