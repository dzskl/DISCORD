const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// IMPORTANTE: o DB precisa ficar em /app/data quando rodando em prod (Railway)
// porque o Volume eh montado em /app/data. __dirname aqui eh /app/src/database
// entao precisamos de TRES '..' pra subir ate /app, e depois 'data'.
const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, '..', '..', 'data', 'botdash.sqlite');
const DB_DIR = path.dirname(DB_FILE);

try {
  fs.mkdirSync(DB_DIR, { recursive: true });
} catch (e) {
  console.error('[DB] falha criando diretorio', DB_DIR, e.message);
}

let db;
try {
  db = new Database(DB_FILE);
} catch (e) {
  console.error('[DB] FALHA ABRINDO DATABASE em', DB_FILE);
  console.error('[DB] erro:', e.message);
  console.error('[DB] verifique: 1) o diretorio existe; 2) ha permissao de escrita; 3) o volume do Railway esta montado em ' + DB_DIR);
  throw e;
}
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
ensureColumn('products', 'category_id', 'INTEGER');
ensureColumn('products', 'delivery_type', "TEXT DEFAULT 'automatic'");
ensureColumn('products', 'hook_url', 'TEXT');
ensureColumn('products', 'discord_channel', 'TEXT');
ensureColumn('products', 'discord_message_id', 'TEXT');
ensureColumn('coupons', 'min_amount_cents', 'INTEGER');
ensureColumn('coupons', 'required_role_id', 'TEXT');
ensureColumn('coupons', 'min_quantity', 'INTEGER');
ensureColumn('coupons', 'max_quantity', 'INTEGER');
ensureColumn('sales', 'expiry_warned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sales', 'cart_items', 'TEXT');
ensureColumn('sales', 'delivery_status', 'TEXT');
ensureColumn('sales', 'affiliate_id', 'INTEGER');
ensureColumn('sales', 'commission_cents', 'INTEGER');

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

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  prize TEXT NOT NULL,
  winners_count INTEGER NOT NULL DEFAULT 1,
  required_role_id TEXT,
  ends_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  winners TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(ended, ends_at);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  discord_tag TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (giveaway_id, discord_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS affiliates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL UNIQUE,
  discord_tag TEXT,
  code TEXT NOT NULL UNIQUE,
  commission_percent INTEGER NOT NULL DEFAULT 10,
  total_sales INTEGER NOT NULL DEFAULT 0,
  total_commission_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS invites_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  member_tag TEXT,
  inviter_id TEXT,
  inviter_tag TEXT,
  invite_code TEXT,
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  left_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites_log(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invites_joined ON invites_log(joined_at DESC);

CREATE TABLE IF NOT EXISTS credentials (
  key TEXT PRIMARY KEY,
  encrypted_value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  discord_id TEXT UNIQUE,
  discord_tag TEXT,
  discord_avatar TEXT,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_login_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id);

CREATE TABLE IF NOT EXISTS subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  stripe_event_id TEXT,
  data TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_events_user ON subscription_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_pwd_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS trial_notifications (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sent_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, kind)
);
`);

ensureColumn('users', 'plan', "TEXT NOT NULL DEFAULT 'free'");
ensureColumn('users', 'stripe_customer_id', 'TEXT');
ensureColumn('users', 'stripe_subscription_id', 'TEXT');
ensureColumn('users', 'subscription_status', 'TEXT');
ensureColumn('users', 'subscription_ends_at', 'INTEGER');
ensureColumn('users', 'trial_ends_at', 'INTEGER');

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
  fraud_threshold: '60',
  fraud_blacklist: '',
  fraud_block_threshold: '80',
  cart_followup_enabled: '1',
  cart_followup_message: '👋 Ei, {tag}! Você deixou um pedido no carrinho da nossa loja. Finalize agora: {url}',
  ga_measurement_id: '',
  fee_percent: '4',
  fee_fixed_cents: '39',
  ticket_category: 'tickets',
  ticket_welcome_message: 'Olá {user}! Como podemos te ajudar?\n\nDescreva sua dúvida ou problema e um membro da equipe vai responder em breve.\n\nClique no botão abaixo para fechar quando resolver.',
  ticket_types: '[{"name":"Suporte","role_id":null,"description":"Ajuda com produtos, instalação, erros ou problemas"},{"name":"Resgate","role_id":null,"description":"Resgate seu produto após a compra"}]',
  dm_admin_on_sale: '1',
  restock_announce: '1',
  manual_delivery_category: 'entregas',
  role_verified: '',
  role_customer: '',
  role_member: '',
  auto_role_on_join: '',
  currency_code: 'BRL',
  locale: 'pt-BR',
  invite_tracker_enabled: '1',
  invite_join_channel: 'geral',
  invite_join_message: '👋 {member} chegou! Convidado por **{invitername}** (total de {invites} convites).',
  invite_leave_message: '👋 {membername} saiu do servidor. Foi convidado por **{invitername}**.',
  payment_gateway: 'stripe',
  brand_logo_url: ''
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

function logEvent({ type, message, discord_id = null, discord_tag = null, channel = null, guild_id = null }) {
  db.prepare('INSERT INTO logs (type,message,discord_id,discord_tag,channel,guild_id) VALUES (?,?,?,?,?,?)')
    .run(type, message, discord_id, discord_tag, channel, guild_id);
}

// ============ CREDENCIAIS ============
// Cada chave (DISCORD_TOKEN, STRIPE_SECRET_KEY etc.) pode vir da DB (encriptada)
// ou do .env. DB tem prioridade. Permite configurar tudo pelo painel sem mexer
// em arquivo.

let _credCache = new Map();
let _credCacheAt = 0;
const CRED_TTL_MS = 5000;

function getCredential(key) {
  if (Date.now() - _credCacheAt > CRED_TTL_MS) {
    _credCache.clear();
    _credCacheAt = Date.now();
  }
  if (_credCache.has(key)) return _credCache.get(key);

  const row = db.prepare('SELECT encrypted_value FROM credentials WHERE key=?').get(key);
  let value = null;
  if (row && row.encrypted_value) {
    const { decrypt } = require('../utils/encryption');
    value = decrypt(row.encrypted_value);
  }
  if (!value && process.env[key]) value = process.env[key];
  _credCache.set(key, value);
  return value;
}

function setCredential(key, plaintext, actor = null) {
  const { encrypt } = require('../utils/encryption');
  const enc = plaintext ? encrypt(plaintext) : null;
  db.prepare(`
    INSERT INTO credentials (key,encrypted_value,updated_at,updated_by)
    VALUES (?,?,strftime('%s','now'),?)
    ON CONFLICT(key) DO UPDATE SET encrypted_value=excluded.encrypted_value, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).run(key, enc, actor);
  _credCache.clear();
}

function listCredentialMeta() {
  const rows = db.prepare('SELECT key, encrypted_value, updated_at, updated_by FROM credentials').all();
  const map = {};
  for (const r of rows) map[r.key] = { in_db: !!r.encrypted_value, updated_at: r.updated_at, updated_by: r.updated_by };
  return map;
}

module.exports = { db, getConfig, setConfig, logEvent, getCredential, setCredential, listCredentialMeta };

if (require.main === module) {
  console.log('Banco inicializado em', DB_FILE);
}
