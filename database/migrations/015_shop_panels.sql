-- Migration 015 — Paineis de Loja (multiplos painels postaveis em canais)

CREATE TABLE IF NOT EXISTS shop_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  channel_id TEXT,
  posted_message_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  embed_color TEXT DEFAULT '#5865F2',
  embed_title TEXT,
  embed_description TEXT,
  embed_footer TEXT,
  embed_image_url TEXT,
  product_ids TEXT,            -- JSON array de IDs de produtos
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_shop_panels_guild ON shop_panels(guild_id);

-- Config de checkout do guild (separado de guild_config json — campos especificos)
CREATE TABLE IF NOT EXISTS shop_checkout_config (
  guild_id TEXT PRIMARY KEY,
  api_key TEXT,
  repass_fee INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  locale TEXT DEFAULT 'pt-BR',
  brand_color_center TEXT DEFAULT '#8B5CF6',
  brand_color_border TEXT DEFAULT '#6D28D9',
  brand_logo_url TEXT,
  qr_zoom INTEGER DEFAULT 100,
  qr_position TEXT DEFAULT 'main',     -- main|thumbnail
  instruction_enabled INTEGER DEFAULT 0,
  instruction_message TEXT,
  instruction_button_name TEXT,
  instruction_button_url TEXT
);
