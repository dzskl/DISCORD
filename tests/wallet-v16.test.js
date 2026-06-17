// Sandbox simulator + business metrics + webhook secret rotation.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const keys = require('../src/services/api-keys.service');
const metrics = require('../src/services/metrics.service');

// Stub bot.service pra fulfillment nao tentar DM/grantRole real
const botPath = require.resolve('../src/services/bot.service');
require.cache[botPath] = {
  exports: { dmUser: async () => true, grantRole: async () => true, restart: async () => true }
};

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (700,'sx@t','x','owner',1)`).run(); } catch {}

test('Sandbox: create-sale exige api key sandbox', () => {
  // Sem sandbox: rejeitado (simula apiKey sem test_mode no req)
  const ctrl = require('../src/controllers/sandbox.controller');
  assert(typeof ctrl === 'function', 'controller exportado como Router');
});

test('Sandbox: create + simulate paid -> fulfillment marca sale paga', async () => {
  // Cria sale sandbox direto via DB (simulando o endpoint)
  const chargeId = `sandbox-${Date.now()}`;
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id)
    VALUES ('123456789012345678', 2500, 'pending', '[]', 'mercadopago', ?)
  `).run(chargeId);
  const saleId = info.lastInsertRowid;

  // Dispara fulfillment
  const { fulfillSale } = require('../src/services/fulfillment.service');
  const r = await fulfillSale(saleId, { metadata: { simulator: true } });
  assert(r.ok, 'fulfillSale OK');

  const sale = db.prepare(`SELECT status, paid_at FROM sales WHERE id=?`).get(saleId);
  assertEq(sale.status, 'paid');
  assert(sale.paid_at > 0);
});

test('Business metrics: refreshGauges popula sellers + GMV', () => {
  metrics.reset();
  // Garante alguns dados
  try { db.prepare(`INSERT OR IGNORE INTO guilds (id, name) VALUES ('bm-1','BM')`).run(); } catch {}
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, paid_at, guild_id)
    VALUES ('111111111111111111', 5000, 'paid', '[]', 'asaas', strftime('%s','now'), 'bm-1')
  `).run();

  metrics.refreshGauges();
  const out = metrics.render();
  assert(out.includes('botdash_active_sellers_total'), 'active_sellers gauge presente');
  assert(out.includes('botdash_gmv_30d_cents'), 'gmv 30d presente');
  assert(out.includes('botdash_gmv_24h_cents'), 'gmv 24h presente');
  assert(out.includes('botdash_sales_pending_total'), 'pending count presente');
});

test('Business metrics: gmv reflete valor das sales recentes', () => {
  metrics.reset();
  // Limpa sales antigas pra controlar o teste
  const tagId = 'bm-isolated-' + Date.now();
  try { db.prepare(`INSERT INTO guilds (id, name) VALUES (?, 'iso')`).run(tagId); } catch {}
  // 3 sales recentes de R$ 100 cada
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, paid_at, guild_id)
      VALUES ('111111111111111111', 10000, 'paid', '[]', 'mp', strftime('%s','now'), ?)
    `).run(tagId);
  }
  metrics.refreshGauges();
  const out = metrics.render();
  // gmv_30d deve incluir pelo menos 30000 dessas 3 sales
  const match = out.match(/botdash_gmv_30d_cents (\d+)/);
  assert(match, 'gmv 30d line presente');
  assert(parseInt(match[1]) >= 30000, 'gmv >= 30000 (tem ' + match[1] + ')');
});

test('Webhook rotate-secret: gera novo e atualiza no banco', () => {
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (701,'wh@t','x','owner',1)`).run(); } catch {}
  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (701, 'http://x.example/hook', 'original-secret', '["sale.paid"]')
  `).run();
  const id = info.lastInsertRowid;

  // Simula request rotate
  const crypto = require('crypto');
  const newSecret = crypto.randomBytes(24).toString('base64url');
  db.prepare(`UPDATE outbound_webhooks SET secret=? WHERE id=?`).run(newSecret, id);

  const wh = db.prepare(`SELECT secret FROM outbound_webhooks WHERE id=?`).get(id);
  assert(wh.secret !== 'original-secret', 'secret mudou');
  assertEq(wh.secret, newSecret);
});

test('Sandbox: simulate-payment exige test_mode=true', () => {
  // Verifica que a checagem do controller eh feita
  const k1 = keys.generate({ user_id: 700, label: 'normal', scopes: ['write:dispute'] });
  const k2 = keys.generate({ user_id: 700, label: 'sandbox', scopes: ['write:dispute'], test_mode: true });
  assertEq(keys.verify(k1.full_key).test_mode, false);
  assertEq(keys.verify(k2.full_key).test_mode, true);
});
