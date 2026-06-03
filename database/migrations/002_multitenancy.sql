-- Migration 002 — Multi-tenant.
-- Cada Discord guild (servidor) eh um tenant. Tudo passa a ser escopado
-- por guild_id. Compativel com schema antigo: guild_id eh nullable e
-- o backfill aplica o valor do credential DISCORD_GUILD_ID se houver.

-- ============ TABELAS NOVAS ============

-- Guilds onde o bot esta presente
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,                    -- Discord guild ID
  name TEXT NOT NULL,
  icon_url TEXT,
  owner_discord_id TEXT,                  -- quem é dono do servidor no Discord
  bot_joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  bot_left_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  -- Cada guild tem seu proprio plano (separado do user)
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT,
  subscription_ends_at INTEGER,
  trial_ends_at INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_guilds_active ON guilds(active);

-- Associacao user <-> guild (M:N)
-- Permite multiplos users gerenciarem a mesma guild (equipe)
-- e um user gerenciar varias guilds (multi-server owner)
CREATE TABLE IF NOT EXISTS user_guilds (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',     -- owner|admin|member
  added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, guild_id)
);
CREATE INDEX IF NOT EXISTS idx_user_guilds_user ON user_guilds(user_id);
CREATE INDEX IF NOT EXISTS idx_user_guilds_guild ON user_guilds(guild_id);

-- ============ ADICIONA guild_id NAS TABELAS DE TENANT ============
-- Cada ALTER eh idempotente via _migrations tracking.

ALTER TABLE products ADD COLUMN guild_id TEXT;
ALTER TABLE sales ADD COLUMN guild_id TEXT;
ALTER TABLE logs ADD COLUMN guild_id TEXT;
ALTER TABLE mod_actions ADD COLUMN guild_id TEXT;
ALTER TABLE announcements ADD COLUMN guild_id TEXT;
ALTER TABLE member_events ADD COLUMN guild_id TEXT;
ALTER TABLE command_usage ADD COLUMN guild_id TEXT;
ALTER TABLE coupons ADD COLUMN guild_id TEXT;
ALTER TABLE auto_replies ADD COLUMN guild_id TEXT;
ALTER TABLE wishlist ADD COLUMN guild_id TEXT;
ALTER TABLE tickets ADD COLUMN guild_id TEXT;
ALTER TABLE stock_log ADD COLUMN guild_id TEXT;
ALTER TABLE categories ADD COLUMN guild_id TEXT;
ALTER TABLE giveaways ADD COLUMN guild_id TEXT;
ALTER TABLE affiliates ADD COLUMN guild_id TEXT;
ALTER TABLE invites_log ADD COLUMN guild_id TEXT;
ALTER TABLE audit_log ADD COLUMN guild_id TEXT;

-- Indexes pra queries filtradas por guild
CREATE INDEX IF NOT EXISTS idx_products_guild ON products(guild_id);
CREATE INDEX IF NOT EXISTS idx_sales_guild ON sales(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_guild ON logs(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON mod_actions(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_guild ON coupons(guild_id);
CREATE INDEX IF NOT EXISTS idx_categories_guild ON categories(guild_id);
CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_guild ON affiliates(guild_id);

-- Config agora eh por guild (key composta)
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (guild_id, key)
);
