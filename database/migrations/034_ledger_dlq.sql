-- Migration 034 — Ledger contabil double-entry + Webhook DLQ

-- =========== LEDGER (double-entry) ===========
-- Cada movimentacao financeira gera DUAS entradas (debit + credit).
-- Soma sempre bate em zero. Saldo de qualquer conta = SUM(amount_cents) por account.
--
-- Contas:
--   user:{id}:available  — saldo liberado do vendedor
--   user:{id}:hold       — em retencao
--   user:{id}:reserve    — reserva chargeback
--   platform:revenue     — receita BotDash
--   platform:withdrawals — saidas PIX out
--   external:gateway     — entrada via gateway (MysticPay/Stripe)

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,         -- agrupa entries da mesma operacao
  account TEXT NOT NULL,                 -- ex: user:42:available
  direction TEXT NOT NULL CHECK(direction IN ('debit','credit')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  signed_amount INTEGER NOT NULL,        -- amount com sinal: -debit, +credit
  ref_type TEXT,                          -- sale | withdrawal | advance | adjustment
  ref_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_entries(ref_type, ref_id);

-- Snapshot diario pra performance (calculado por cron)
CREATE TABLE IF NOT EXISTS ledger_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,           -- YYYY-MM-DD
  balance_cents INTEGER NOT NULL,
  entries_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(account, snapshot_date)
);

-- =========== WEBHOOK DLQ ===========
-- Quando webhook_events.status = 'failed', joga aqui pra retry.
CREATE TABLE IF NOT EXISTS webhook_dlq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_event_id INTEGER NOT NULL REFERENCES webhook_events(id),
  gateway TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | succeeded | exhausted
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_dlq_next ON webhook_dlq(status, next_attempt_at) WHERE status = 'pending';

-- =========== RATE LIMIT (por tenant) ===========
-- Rate limit ativo em memoria + persistido aqui pra observabilidade
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,                     -- ex: tenant:guild_id:checkout
  count INTEGER NOT NULL,
  limit_reached_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_rate_violations_key ON rate_limit_violations(key, limit_reached_at DESC);
