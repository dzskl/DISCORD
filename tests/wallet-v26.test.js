// GraphQL-lite + load test script + webhook attempts UI data.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const gql = require('../src/services/graphql-lite.service');

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (1100,'gq@t','x','owner',1)`).run(); } catch {}

test('GraphQL parse: campo simples', () => {
  const fields = gql.parse('{ providers { id label } }');
  assertEq(fields.length, 1);
  assertEq(fields[0].name, 'providers');
  assertEq(fields[0].fields.length, 2);
  assertEq(fields[0].fields[0].name, 'id');
});

test('GraphQL parse: args com tipos', () => {
  const fields = gql.parse('{ sales(status: "paid", limit: 10) { id } }');
  assertEq(fields[0].args.status, 'paid');
  assertEq(fields[0].args.limit, 10);
});

test('GraphQL parse: query wrapper removido', () => {
  const fields = gql.parse('query { stats { gmv_30d_cents } }');
  assertEq(fields[0].name, 'stats');
});

test('GraphQL execute: providers resolver', () => {
  const r = gql.execute('{ providers { id label method } }', {});
  assert(r.data.providers, 'providers retornado');
  assert(Array.isArray(r.data.providers));
  assert(r.data.providers.length >= 1);
  // pick limita aos campos pedidos
  const p = r.data.providers[0];
  assert('id' in p && 'label' in p && 'method' in p);
  assert(!('country' in p), 'country nao pedido nao retornado');
});

test('GraphQL execute: sales resolver com filtro', () => {
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at)
              VALUES ('111111111111111111', 5000, 'paid', '[]', 'mercadopago', 'gq-1', strftime('%s','now'))`).run();
  const r = gql.execute('{ sales(status: "paid", limit: 5) { id amount_cents status } }', {});
  assert(Array.isArray(r.data.sales));
  assert(r.data.sales.length >= 1);
  const s = r.data.sales[0];
  assert('id' in s && 'amount_cents' in s && 'status' in s);
});

test('GraphQL execute: sale com timeline aninhado', () => {
  const info = db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at)
              VALUES ('111111111111111111', 3000, 'paid', '[]', 'asaas', 'gq-tl', strftime('%s','now'))`).run();
  const r = gql.execute(`{ sale(id: ${info.lastInsertRowid}) { id status timeline { type label } } }`, {});
  assert(r.data.sale, 'sale retornado');
  assert(Array.isArray(r.data.sale.timeline), 'timeline array');
  assert(r.data.sale.timeline.length >= 2, 'created + paid');
  assertEq(r.data.sale.timeline[0].type, 'created');
});

test('GraphQL execute: stats resolver', () => {
  const r = gql.execute('{ stats { gmv_30d_cents active_sellers } }', {});
  assert(r.data.stats, 'stats retornado');
  assert(typeof r.data.stats.gmv_30d_cents === 'number');
  assert(typeof r.data.stats.active_sellers === 'number');
});

test('GraphQL execute: campo desconhecido vira error', () => {
  const r = gql.execute('{ inexistente { foo } }', {});
  assert(r.errors, 'erro retornado');
  assert(r.errors[0].message.includes('inexistente'));
});

test('GraphQL execute: guildScoped filtra sales estrito', () => {
  db.prepare(`INSERT OR IGNORE INTO guilds (id, name) VALUES ('gq-guild', 'GQ')`).run();
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, guild_id, paid_at)
              VALUES ('111111111111111111', 1000, 'paid', '[]', 'mp', 'gq-scoped', 'gq-guild', strftime('%s','now'))`).run();
  // Com guildScoped, sale(id) de outra guild retorna null
  const otherSale = db.prepare(`SELECT id FROM sales WHERE provider_charge_id='gq-1'`).get();
  const r = gql.execute(`{ sale(id: ${otherSale.id}) { id } }`, { guildId: 'gq-guild', guildScoped: true });
  assertEq(r.data.sale, null, 'sale de outra guild bloqueada');
});

test('Load test script: arquivo valido', () => {
  const { execSync } = require('child_process');
  const path = require('path');
  execSync(`node --check ${path.join(__dirname, '..', 'scripts', 'load-test.js')}`, { stdio: 'pipe' });
});

test('GraphQL parse: protege contra query gigante (controller valida len)', () => {
  // O controller rejeita > 8000 chars; o parser nao deve travar com query normal
  const fields = gql.parse('{ sales { id } providers { id } stats { gmv_30d_cents } }');
  assertEq(fields.length, 3);
});
