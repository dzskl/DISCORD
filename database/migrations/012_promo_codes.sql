-- Migration 012 — Codigos promocionais resgataveis pelo user
-- Tipos: trial_extend (estende trial X dias), credit (saldo bonus),
-- module_unlock (libera modulo especifico)

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,                  -- trial_extend|credit|module_unlock
  value TEXT NOT NULL,                 -- '7d' / '5000' (cents) / 'autoreply'
  max_uses INTEGER,                    -- null = ilimitado
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(code_id, user_id)
);
