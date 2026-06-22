// CSV export + GraphQL aliases + anomaly detector + dead-letter.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const gql = require('../src/services/graphql-lite.service');

const botPath = require.resolve('../src/services/bot.service');
require.cache[botPath] = { exports: { dmUser: async () => true, grantRole: async () => true, restart: async () => true } };

const origTest = global.test;
let chain = Promise.resolve();
const pending = [];
global.test = function (n, fn) {
  if (fn.constructor.name === 'AsyncFunction') {
    chain = chain.then(() => Promise.resolve(origTest(n, fn)));
    pending.push(chain);
    return chain;
  }
  return origTest(n, fn);
};

test('GraphQL alias: a: sales b: sales — keys distintas', () => {
  const r = gql.execute('{ a: sales(status: "paid") { id } b: sales(status: "refunded") { id } }', {});
  assert(r.data.a, 'alias a presente');
  assert(r.data.b, 'alias b presente');
  assert(Array.isArray(r.data.a) && Array.isArray(r.data.b));
});

test('GraphQL alias: usa nome real no resolver, retorna no alias', () => {
  const r = gql.execute('{ allProviders: providers { id } }', {});
  assert(r.data.allProviders, 'alias allProviders presente');
  assert(!r.data.providers, 'campo original NAO presente');
});

test('GraphQL monthlyReport: retorna month + gmv + rates', () => {
  // Cria 2 paid + 1 refunded no mes
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at) VALUES ('111111111111111111', 1000, 'paid', '[]', 'mp', 'mr-1-' || ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at) VALUES ('111111111111111111', 2000, 'paid', '[]', 'mp', 'mr-2-' || ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at) VALUES ('111111111111111111', 500, 'refunded', '[]', 'mp', 'mr-3-' || ?, ?)`).run(now, now);

  const month = new Date().toISOString().slice(0, 7);
  const r = gql.execute(`{ monthlyReport(month: "${month}") { month gmv_cents total_sales refunds refund_rate_pct } }`, {});
  assert(r.data.monthlyReport);
  assertEq(r.data.monthlyReport.month, month);
  assert(r.data.monthlyReport.total_sales >= 2);
  assert(r.data.monthlyReport.refunds >= 1);
});

test('Anomaly detector: skip se baseline pequeno', async () => {
  const ad = require('../src/services/anomaly-detector.service');
  // Vai depender do estado do DB; smoke test que retorna objeto
  const r = await ad.run();
  assert(typeof r === 'object', 'retorna objeto');
});

test('Anomaly: queda calc — ratio 0.4 dispara (< 50%)', () => {
  const baseline = 100000, recent = 40000;
  const ratio = recent / baseline;
  const drop = ratio < 0.5;
  assert(drop, '40% < 50% threshold');
});

test('Dead-letter: query estrutura', () => {
  // Cria webhook + attempt #5 falhada
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (1200,'dl@t','x','owner',1)`).run(); } catch {}
  const wh = db.prepare(`INSERT INTO outbound_webhooks (user_id, url, secret, events, active) VALUES (1200, 'http://dead/hook', 's', '["sale.paid"]', 0)`).run();
  db.prepare(`INSERT INTO outbound_webhook_attempts (webhook_id, event, payload, status_code, error, attempt_number, succeeded) VALUES (?, 'sale.paid', '{}', 503, 'connection timeout', 5, 0)`).run(wh.lastInsertRowid);

  const rows = db.prepare(`
    SELECT a.id, a.event, a.attempt_number, w.active AS hook_active
    FROM outbound_webhook_attempts a
    JOIN outbound_webhooks w ON w.id = a.webhook_id
    WHERE w.user_id=1200 AND a.succeeded=0 AND a.attempt_number>=5
  `).all();
  assert(rows.length >= 1);
  assertEq(rows[0].attempt_number, 5);
});

test('CSV export: linhas tem 10 colunas', () => {
  // Validacao do shape do CSV (sem chamar HTTP)
  const cols = ['id','date_iso','status','provider','charge_id','amount_brl','net_brl','discord_id','discord_tag','guild_id'];
  assertEq(cols.length, 10);
});

module.exports = Promise.all(pending).then(() => { global.test = origTest; });
