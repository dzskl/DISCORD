-- Migration 013 — 2FA (TOTP) + bloqueio MED na carteira

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS totp_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_totp_codes_user ON totp_recovery_codes(user_id);

-- MED = bloqueio temporario do Banco Central
ALTER TABLE withdrawals ADD COLUMN med_blocked_cents INTEGER DEFAULT 0;
