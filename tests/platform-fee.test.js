// Pricing v3 (intermediario): BotDash nao cobra comissao sobre vendas.
// platform-fee.js retorna fees=0 em todos os planos. Os testes garantem
// que (a) o vendedor recebe o valor cheio e (b) o codigo legado nao quebra
// quando rate=0 e fixed=0.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  const migrations = [
    '001_initial_schema', '002_multitenancy', '022_platform_fee',
    '024_platform_fixed_fee', '025_sale_hold_period', '031_super_admin',
    '032_pricing_v2'
  ];
  for (const m of migrations) {
    try { db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', m + '.sql'), 'utf8')); } catch {}
  }
  return db;
}

function setupSeller(db, id, plan) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO users (id,email,password_hash,role,plan,created_at,subscription_status,subscription_ends_at) VALUES (?,?,?,?,?,?,?,?)').run(
    id, `seller${id}@t`, 'x', 'owner', plan,
    now - 90 * 86400,
    plan === 'free' ? null : 'active',
    plan === 'free' ? null : now + 30 * 86400
  );
  db.prepare('INSERT INTO user_guilds (user_id, guild_id, role) VALUES (?,?,?)').run(id, 'g' + id, 'owner');
}

const pf = require('../src/config/platform-fee');

test('Free: vendedor recebe valor cheio (sem comissao)', () => {
  const db = makeDb();
  setupSeller(db, 1, 'free');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (10000, 'g1', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.percent_fee_cents, 0, 'sem comissao percentual');
  assertEq(r.fixed_fee_cents, 0, 'sem taxa fixa');
  assertEq(r.net_to_owner_cents, 10000, 'vendedor recebe tudo');
  assertEq(r.seller_plan, 'free');
});

test('Pro: vendedor recebe valor cheio (sem comissao)', () => {
  const db = makeDb();
  setupSeller(db, 2, 'pro');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (10000, 'g2', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.percent_fee_cents, 0);
  assertEq(r.fixed_fee_cents, 0);
  assertEq(r.net_to_owner_cents, 10000);
  assertEq(r.seller_plan, 'pro');
});

test('Scale: vendedor recebe valor cheio (sem comissao)', () => {
  const db = makeDb();
  setupSeller(db, 3, 'scale');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (10000, 'g3', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.percent_fee_cents, 0);
  assertEq(r.fixed_fee_cents, 0);
  assertEq(r.net_to_owner_cents, 10000);
});

test('Venda micro nao perde precisao (rate=0 nao quebra cap)', () => {
  const db = makeDb();
  setupSeller(db, 4, 'free');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (100, 'g4', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.net_to_owner_cents, 100, 'vendedor recebe os 100 centavos cheios');
  assertEq(r.percent_fee_cents + r.fixed_fee_cents, 0);
});
