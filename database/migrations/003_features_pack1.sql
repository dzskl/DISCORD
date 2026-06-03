-- Migration 003 — Saldo/saques, verificacao PIX, notificacoes, permissoes da equipe.

-- ============ SAQUES (withdrawals) ============
-- Cada saque do dono do tenant. Saldo = SUM(sales pagas) - SUM(saques pagos/pending)
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT,
  amount_cents INTEGER NOT NULL,
  pix_key TEXT NOT NULL,
  pix_key_type TEXT,                   -- cpf|cnpj|email|phone|random
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|paid|rejected
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL,
  reason TEXT,
  requested_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  processed_at INTEGER,
  external_tx_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- ============ VERIFICACAO DE IDENTIDADE (KYC PIX) ============
-- Fluxo: user informa CPF+PIX, recebe QR de R$0,99, paga, sobe comprovante,
-- admin (ou automatico) aprova. So apos aprovado pode sacar.
CREATE TABLE IF NOT EXISTS user_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  cpf_cnpj TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  -- pending_payment | pending_proof | pending_review | approved | rejected
  payment_amount_cents INTEGER NOT NULL DEFAULT 99,
  payment_qr_payload TEXT,
  payment_tx_id TEXT,
  proof_file_path TEXT,
  proof_uploaded_at INTEGER,
  reviewed_at INTEGER,
  reviewer_id INTEGER REFERENCES users(id),
  rejection_reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- ============ NOTIFICACOES IN-APP ============
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT,
  kind TEXT NOT NULL,                  -- sale|ticket|warning|info|withdrawal
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at DESC);

-- ============ PERMISSOES DA EQUIPE ============
-- Por user dentro de uma guild — granular alem de owner/admin/member
CREATE TABLE IF NOT EXISTS team_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,            -- view|manage_app|edit_shop|manage_team|withdraw|view_finance|mod
  granted INTEGER NOT NULL DEFAULT 1,
  granted_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, guild_id, permission)
);
