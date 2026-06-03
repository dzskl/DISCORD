-- Migration 010 — Telegram bot (skeleton)

CREATE TABLE IF NOT EXISTS telegram_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  guild_id TEXT,
  state TEXT DEFAULT 'new',
  last_seen INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS telegram_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  guild_id TEXT,
  telegram_id INTEGER NOT NULL,
  telegram_username TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_payment_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tg_sales_tg ON telegram_sales(telegram_id);
