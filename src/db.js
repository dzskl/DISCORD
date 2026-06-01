const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data', 'botdash.sqlite');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL,
  role_id TEXT,
  duration TEXT NOT NULL DEFAULT 'permanent',
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  discord_id TEXT NOT NULL,
  discord_tag TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  role_granted INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  discord_id TEXT,
  discord_tag TEXT,
  channel TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);

CREATE TABLE IF NOT EXISTS mod_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_tag TEXT,
  moderator_id TEXT,
  moderator_tag TEXT,
  reason TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_mod_created ON mod_actions(created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channels TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'texto',
  embed_title TEXT,
  embed_color TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  scheduled_for INTEGER,
  sent_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ann_sched ON announcements(scheduled_for);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  discord_tag TEXT,
  event TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_mev_created ON member_events(created_at DESC);

CREATE TABLE IF NOT EXISTS command_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  discord_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cmd_created ON command_usage(created_at DESC);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS auto_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains',
  response TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ar_active ON auto_replies(active);
`);

function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
ensureColumn('products', 'image_url', 'TEXT');
ensureColumn('products', 'stock', 'INTEGER');
ensureColumn('products', 'accent_color', 'TEXT');
ensureColumn('products', 'cost_cents', 'INTEGER');
ensureColumn('coupons', 'min_amount_cents', 'INTEGER');
ensureColumn('sales', 'expiry_warned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sales', 'cart_items', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS wishlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  notified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(discord_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_product ON wishlist(product_id);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  discord_tag TEXT,
  channel_id TEXT,
  subject TEXT,
  ticket_type TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS stock_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  before_qty INTEGER,
  after_qty INTEGER,
  reason TEXT,
  actor TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_log_product ON stock_log(product_id, created_at DESC);
`);

const defaultConfig = {
  bot_name: 'BotDash',
  prefix: '/',
  log_events: '1',
  auto_mod: '1',
  maintenance: '0',
  logs_channel: 'bot-logs',
  welcome_channel: 'geral',
  welcome_message: 'Bem-vindo(a), {user}! 👋 Voce e o membro #{count} do {server}.',
  sales_channel: 'vendas',
  mod_channel: 'mod-log',
  anti_spam: '1',
  anti_flood: '1',
  filter_links: '1',
  filter_words: '0',
  alert_bans: '1',
  alert_sales: '1',
  daily_report: '1',
  webhook_url: '',
  forbidden_words: 'palavrao1,palavrao2',
  link_allowlist: 'discord.com,discord.gg,tenor.com,giphy.com',
  dm_purchase: '1',
  rules_text: '1. Respeite todos os membros.\n2. Nada de spam ou flood.\n3. Nada de NSFW fora dos canais apropriados.\n4. Sem links suspeitos.',
  daily_report_hour: '9',
  pass_fees_to_customer: '0',
  fee_percent: '4',
  fee_fixed_cents: '39',
  ticket_category: 'tickets',
  ticket_welcome_message: 'Olá {user}! Como podemos te ajudar?\n\nDescreva sua dúvida ou problema e um membro da equipe vai responder em breve.\n\nClique no botão abaixo para fechar quando resolver.',
  ticket_types: '[{"name":"Suporte","role_id":null,"description":"Ajuda com produtos, instalação, erros ou problemas"},{"name":"Resgate","role_id":null,"description":"Resgate seu produto após a compra"}]',
  dm_admin_on_sale: '1',
  restock_announce: '1'
};
const insertCfg = db.prepare('INSERT OR IGNORE INTO config (key,value) VALUES (?,?)');
for (const [k, v] of Object.entries(defaultConfig)) insertCfg.run(k, v);

function getConfig() {
  const rows = db.prepare('SELECT key,value FROM config').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function setConfig(updates) {
  const stmt = db.prepare('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(entries => entries.forEach(([k, v]) => stmt.run(k, String(v))));
  tx(Object.entries(updates));
}

function logEvent({ type, message, discord_id = null, discord_tag = null, channel = null }) {
  db.prepare('INSERT INTO logs (type,message,discord_id,discord_tag,channel) VALUES (?,?,?,?,?)')
    .run(type, message, discord_id, discord_tag, channel);
}

module.exports = { db, getConfig, setConfig, logEvent };

if (require.main === module) {
  console.log('Banco inicializado em', DB_FILE);
}
