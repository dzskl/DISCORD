-- Migration 033 — Lock-in features: reviews, BotDash Points, referrals (camada B)

-- =========== REVIEWS ===========
-- Comprador avalia produto + vendedor apos D+7 da compra
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  guild_id TEXT,
  seller_user_id INTEGER REFERENCES users(id),
  buyer_discord_id TEXT,
  buyer_discord_tag TEXT,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'visible',  -- visible | hidden | reported
  hidden_reason TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(sale_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_user_id, status);

-- Convite pra avaliar (gerado D+7 da compra paga, expira em 30d)
CREATE TABLE IF NOT EXISTS review_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_invites_token ON review_invites(token);

-- =========== BOTDASH POINTS ===========
-- Cashback interno. 1% de cada venda paga vira ponto pro vendedor.
-- Pontos pagam mensalidade, antecipacao, featured, saque turbo.
CREATE TABLE IF NOT EXISTS user_points (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  balance_points INTEGER NOT NULL DEFAULT 0,  -- 1 ponto = 1 centavo
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  tier TEXT DEFAULT 'bronze',  -- bronze | prata | ouro | diamante
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,        -- + para credito, - para debito
  reason TEXT NOT NULL,           -- sale | referral | spend_advance | spend_featured | spend_badge | spend_subscription | admin_grant
  ref_type TEXT,                  -- sale | advance_request | featured_product | etc
  ref_id INTEGER,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON points_ledger(user_id, created_at DESC);

-- =========== REFERRALS (camada B — afiliado traz vendedor) ===========
-- Vendedor indica outro vendedor. Quem indicou ganha 20% da receita
-- BotDash gerada pelo indicado por 12 meses.
CREATE TABLE IF NOT EXISTS referral_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code TEXT NOT NULL UNIQUE,           -- gerado random, 8 chars
  active INTEGER NOT NULL DEFAULT 1,
  total_referred INTEGER DEFAULT 0,
  total_earned_cents INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ref_codes_user ON referral_codes(user_id);

CREATE TABLE IF NOT EXISTS referral_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id),
  referee_user_id INTEGER NOT NULL REFERENCES users(id),
  code_used TEXT NOT NULL,
  rev_share_pct REAL NOT NULL DEFAULT 0.20,   -- 20% padrao
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,                    -- starts + 365d
  total_paid_cents INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',       -- active | expired | revoked
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(referee_user_id)                       -- indicado so pode ter 1 indicador
);
CREATE INDEX IF NOT EXISTS idx_ref_rel_referrer ON referral_relationships(referrer_user_id, status);

-- Comissoes pagas — registro de cada credito ao referrer
CREATE TABLE IF NOT EXISTS referral_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id INTEGER NOT NULL REFERENCES referral_relationships(id),
  source_sale_id INTEGER REFERENCES sales(id),
  source_addon_id INTEGER REFERENCES addon_purchases(id),
  platform_revenue_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  paid_in TEXT NOT NULL DEFAULT 'points',      -- points | cash
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ref_comm_rel ON referral_commissions(relationship_id, created_at DESC);

-- Captura referral_code do usuario que se cadastrou
ALTER TABLE users ADD COLUMN referred_by_code TEXT;
ALTER TABLE users ADD COLUMN referred_at INTEGER;
