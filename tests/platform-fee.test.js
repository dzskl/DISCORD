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

test('Free: 7,9% + R$ 1,49', () => {
  const db = makeDb();
  setupSeller(db, 1, 'free');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (10000, 'g1', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.percent_fee_cents, 790, 'percent fee Free');
  assertEq(r.fixed_fee_cents, 149, 'fixed fee Free');
  assertEq(r.net_to_owner_cents, 10000 - 790 - 149);
  assertEq(r.seller_plan, 'free');
});

test('Pro: 3,9% + R$ 0,99', () => {
  const db = makeDb();
  setupSeller(db, 2, 'pro');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (10000, 'g2', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.percent_fee_cents, 390);
  assertEq(r.fixed_fee_cents, 99);
  assertEq(r.seller_plan, 'pro');
});

test('Scale: 2,9% + R$ 0,49', () => {
  const db = makeDb();
  setupSeller(db, 3, 'scale');
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (10000, 'g3', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assertEq(r.percent_fee_cents, 290);
  assertEq(r.fixed_fee_cents, 49);
});

test('Cap em venda micro nao zera vendedor', () => {
  const db = makeDb();
  setupSeller(db, 4, 'free');
  // Venda R$ 1,00 — taxa fixa de R$ 1,49 zeraria o vendedor
  const sId = db.prepare("INSERT INTO sales (amount_cents, guild_id, status, paid_at, discord_id) VALUES (100, 'g4', 'paid', strftime('%s','now'), '1')").run().lastInsertRowid;
  const r = pf.applyFeeToSale(db, sId);
  assert(r.net_to_owner_cents >= 1, 'vendedor sempre recebe >= R$ 0,01');
  assert(r.net_to_owner_cents + r.percent_fee_cents + r.fixed_fee_cents === 100, 'soma fecha');
});
