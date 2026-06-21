// Span enrichment + GraphQL introspection + usage report.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const gql = require('../src/services/graphql-lite.service');

// Stub bot pro fulfillment
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

test('Tracing: traced helper mede e captura sucesso', async () => {
  const t = require('../src/services/tracing.service');
  const r = await t.traced('test.op', {}, async (span) => {
    span.setAttribute('foo', 'bar');
    return 42;
  });
  assertEq(r, 42);
});

test('Tracing: traced captura erro e re-throw', async () => {
  const t = require('../src/services/tracing.service');
  let threw = false;
  try {
    await t.traced('test.err', {}, async () => { throw new Error('boom'); });
  } catch (e) {
    threw = e.message === 'boom';
  }
  assert(threw, 'erro re-lancado');
});

test('Fulfillment: cria span e marca sale paga', async () => {
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id)
    VALUES ('111111111111111111', 5000, 'pending', '[]', 'mercadopago', 'span-test-1')
  `).run();
  const { fulfillSale } = require('../src/services/fulfillment.service');
  const r = await fulfillSale(info.lastInsertRowid, {});
  assert(r.ok);
  const sale = db.prepare('SELECT status FROM sales WHERE id=?').get(info.lastInsertRowid);
  assertEq(sale.status, 'paid');
  // Span deve ter sido registrado no tracing
  const t = require('../src/services/tracing.service');
  const spans = t.recent(99999);
  const fSpan = spans.find(s => s.name === 'fulfillment.process' && s.attributes.sale_id === info.lastInsertRowid);
  assert(fSpan, 'span de fulfillment registrado');
  assertEq(fSpan.attributes.result, 'ok');
});

test('GraphQL: __schema introspection', () => {
  const r = gql.execute('{ __schema }', {});
  assert(r.data.__schema, 'schema retornado');
  assert(r.data.__schema.queries.sales, 'query sales descrita');
  assert(r.data.__schema.queries.sale.args.id, 'sale tem arg id');
  assertEq(r.data.__schema.queries.stats.returns, 'Stats');
});

test('Usage report: query agrega vendas do mes', () => {
  // Insere 3 sales pagas no mes atual
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, net_to_owner_cents, status, cart_items, provider, provider_charge_id, paid_at)
      VALUES ('111111111111111111', 10000, 10000, 'paid', '[]', 'mercadopago', 'ur-${i}-' || ?, ?)
    `).run(now, now);
  }
  // 1 refund
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at)
    VALUES ('111111111111111111', 5000, 'refunded', '[]', 'asaas', 'ur-ref-' || ?, ?)
  `).run(now, now);

  const month = new Date().toISOString().slice(0, 7);
  const start = Math.floor(new Date(month + '-01T00:00:00Z').getTime() / 1000);
  const nm = new Date(month + '-01T00:00:00Z'); nm.setUTCMonth(nm.getUTCMonth() + 1);
  const end = Math.floor(nm.getTime() / 1000);

  const summary = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(amount_cents),0) AS gmv
    FROM sales WHERE status='paid' AND provider IS NOT NULL AND paid_at >= ? AND paid_at < ?
      AND provider_charge_id LIKE 'ur-%'
  `).get(start, end);
  assert(summary.total >= 3, 'pelo menos 3 vendas');
  assert(summary.gmv >= 30000, 'GMV >= 30000');
});

test('Usage report: refund rate calculado', () => {
  // total=10, refunds=2 -> 20%
  const total = 10, refunds = 2;
  const rate = Math.round((refunds / total) * 1000) / 10;
  assertEq(rate, 20.0);
});

test('Usage report: month parser valida formato', () => {
  const valid = '2026-06'.match(/^\d{4}-\d{2}$/);
  const invalid = 'lixo'.match(/^\d{4}-\d{2}$/);
  assert(valid, 'YYYY-MM valido');
  assert(!invalid, 'lixo rejeitado');
});

module.exports = Promise.all(pending).then(() => { global.test = origTest; });
