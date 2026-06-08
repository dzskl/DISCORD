const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  const migrations = ['001_initial_schema', '002_multitenancy', '022_platform_fee',
    '024_platform_fixed_fee', '025_sale_hold_period', '031_super_admin',
    '032_pricing_v2', '033_reviews_points_referrals'];
  for (const m of migrations) {
    try { db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', m + '.sql'), 'utf8')); } catch {}
  }
  return db;
}

function setupUser(db, id, plan = 'free') {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO users (id,email,password_hash,role,plan,created_at) VALUES (?,?,?,?,?,?)').run(id, `u${id}@t`, 'x', 'owner', plan, now - 90 * 86400);
  db.prepare('INSERT INTO user_guilds (user_id, guild_id, role) VALUES (?,?,?)').run(id, 'g' + id, 'owner');
}

const points = require('../src/services/points.service');
const refs = require('../src/services/referrals.service');

test('points: credit + debit', () => {
  const db = makeDb();
  setupUser(db, 1);
  points.credit(db, 1, 100, 'sale');
  assertEq(points.getBalance(db, 1).balance_points, 100);
  points.debit(db, 1, 30, 'spend_advance');
  assertEq(points.getBalance(db, 1).balance_points, 70);
});

test('points: debit acima do saldo lanca', () => {
  const db = makeDb();
  setupUser(db, 1);
  points.credit(db, 1, 50, 'sale');
  let threw = false;
  try { points.debit(db, 1, 100, 'spend'); } catch { threw = true; }
  assert(threw, 'debit acima do saldo deve falhar');
});

test('tier sobe com lifetime_earned', () => {
  const db = makeDb();
  setupUser(db, 1);
  points.credit(db, 1, 5000, 'sale');
  assertEq(points.getBalance(db, 1).tier, 'prata');
  points.credit(db, 1, 25000, 'sale');
  assertEq(points.getBalance(db, 1).tier, 'ouro');
});

test('awardForSale: 1% do net', () => {
  const db = makeDb();
  setupUser(db, 1);
  points.awardForSale(db, 1, 999, 9061);  // R$ 90,61 net
  assertEq(points.getBalance(db, 1).balance_points, 90); // 1%
});

test('referral: indicar e receber comissao', () => {
  const db = makeDb();
  setupUser(db, 1);
  setupUser(db, 2);
  const code = refs.getOrCreateCode(db, 1);
  assert(code.length === 8, 'codigo tem 8 chars');
  const relId = refs.linkReferee(db, 2, code);
  assert(relId, 'linkagem criada');

  // Auto-referral bloqueado
  assert(refs.linkReferee(db, 1, code) === null, 'auto-referral bloqueado');

  // Comissao de R$ 9,39 plataforma -> 20% = R$ 1,88 pra referrer
  const r = refs.payCommissionFromSale(db, 2, 999, 939);
  assertEq(r.commission_cents, 188);
  assertEq(points.getBalance(db, 1).balance_points, 188);
});
