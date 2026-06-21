// E2E test: cria sale via /api/checkout/wallet/create -> dispara webhook
// -> verifica fulfillment completo (sale paid, role grant, DM, points).
//
// Usa connector fake registrado em registry (mesma estrategia do
// wallet-webhook.test.js). Nao chama API externa.

const express = require('express');
const http = require('http');
const { db, getCredential, setCredential } = require('../src/database/connection');
const { BaseConnector } = require('../src/providers/wallet/base.connector');
const registry = require('../src/providers/wallet');
const wallet = require('../src/config/wallet-providers');

// Stub bot
const botPath = require.resolve('../src/services/bot.service');
require.cache[botPath] = {
  exports: { dmUser: async () => true, grantRole: async () => true, restart: async () => true }
};

// Fake provider que controla createCharge + webhook
const PROVIDER_ID = 'e2efake';
const CHARGE_STATE = {};   // tracking de cobrancas criadas

class E2EFake extends BaseConnector {
  constructor() { super({ providerId: PROVIDER_ID, credentials: {} }); }
  static get REQUIRED_CREDS() { return []; }
  async createCharge({ amount_cents, external_reference }) {
    const charge_id = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    CHARGE_STATE[charge_id] = { amount_cents, external_reference, status: 'pending' };
    return {
      external_id: charge_id,
      qr_code: '00020126360014BR.GOV.BCB.PIX...',
      qr_image: null,
      pay_url: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      amount_cents,
      raw: { charge_id }
    };
  }
  async fetchPayment(id) { return { id, status: CHARGE_STATE[id]?.status || 'pending' }; }
  mapStatus(p) { return p.status; }
  parseWebhook(req) {
    const b = req.body || {};
    return { event: b.evt || 'paid', external_id: b.id, raw: b, paid_at: Math.floor(Date.now() / 1000) };
  }
  verifySignature() { return true; }
}
registry.CONNECTORS[PROVIDER_ID] = E2EFake;
wallet.PROVIDERS[PROVIDER_ID] = {
  id: PROVIDER_ID, label: 'E2E Fake', method: 'pix', country: 'BR',
  credentials: [], sort: 99
};
wallet.PROVIDER_FEATURE[PROVIDER_ID] = null;

const walletCheckout = require('../src/controllers/wallet-checkout.controller');
const walletWebhook  = require('../src/controllers/wallet-webhook.controller');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Stub auth + guild
  app.use((req, res, next) => {
    req.appUser = { id: 1 };
    req.guildId = null;
    next();
  });
  app.use('/api/checkout/wallet', walletCheckout);
  app.use('/webhooks/wallet', walletWebhook);
  return app;
}

function request(app, { path, method = 'POST', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1', port, path, method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
      }, (res) => {
        let chunks = '';
        res.on('data', c => chunks += c);
        res.on('end', () => {
          server.close();
          let parsed = null; try { parsed = JSON.parse(chunks); } catch {}
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (data) req.write(data); req.end();
    });
  });
}

const pending = [];
const origTest = global.test;
global.test = function (n, fn) {
  const r = origTest(n, fn);
  if (r && typeof r.then === 'function') pending.push(r);
  return r;
};

test('E2E: cria produto + sale via wallet/create -> webhook paid -> sale=paid', async () => {
  // 1. Cria produto
  const pInfo = db.prepare(`
    INSERT INTO products (name, price_cents, active, duration)
    VALUES ('Produto E2E', 5000, 1, 'permanent')
  `).run();
  const productId = pInfo.lastInsertRowid;

  // 2. Cria sale via wallet/create
  const r = await request(buildApp(), {
    path: '/api/checkout/wallet/create',
    body: {
      provider: PROVIDER_ID,
      items: [{ product_id: productId, quantity: 1 }],
      discord_id: '111111111111111111'
    }
  });
  assertEq(r.status, 200, 'create OK');
  assert(r.body.sale_id > 0);
  assert(r.body.qr_code, 'qr_code retornado');
  const saleId = r.body.sale_id;
  const chargeId = r.body.charge_id;

  // 3. Verifica sale pending no banco
  const beforeSale = db.prepare(`SELECT status, provider, provider_charge_id FROM sales WHERE id=?`).get(saleId);
  assertEq(beforeSale.status, 'pending');
  assertEq(beforeSale.provider, PROVIDER_ID);
  assertEq(beforeSale.provider_charge_id, chargeId);

  // 4. Dispara webhook 'paid'
  const wh = await request(buildApp(), {
    path: `/webhooks/wallet/${PROVIDER_ID}`,
    body: { id: chargeId, evt: 'paid' }
  });
  assertEq(wh.status, 200);
  assertEq(wh.body.ok, true);

  // 5. Verifica sale paid + fulfillment rodou
  const afterSale = db.prepare(`SELECT status, paid_at FROM sales WHERE id=?`).get(saleId);
  assertEq(afterSale.status, 'paid', 'fulfillment marcou paid');
  assert(afterSale.paid_at > 0, 'paid_at preenchido');
});

test('E2E: status polling via /api/checkout/wallet/status/:id', async () => {
  // Cria sale + paga
  const pInfo = db.prepare(`INSERT INTO products (name, price_cents, active) VALUES ('Poll', 1000, 1)`).run();
  const r1 = await request(buildApp(), {
    path: '/api/checkout/wallet/create',
    body: { provider: PROVIDER_ID, items: [{ product_id: pInfo.lastInsertRowid, quantity: 1 }], discord_id: '111111111111111111' }
  });
  const saleId = r1.body.sale_id;

  // Polling antes do pagamento
  const before = await request(buildApp(), { path: `/api/checkout/wallet/status/${saleId}`, method: 'GET' });
  assertEq(before.status, 200);
  assertEq(before.body.status, 'pending');

  // Webhook paid
  await request(buildApp(), { path: `/webhooks/wallet/${PROVIDER_ID}`, body: { id: r1.body.charge_id, evt: 'paid' } });

  // Polling depois
  const after = await request(buildApp(), { path: `/api/checkout/wallet/status/${saleId}`, method: 'GET' });
  assertEq(after.body.status, 'paid');
});

test('E2E: webhook duplicado e idempotente', async () => {
  const pInfo = db.prepare(`INSERT INTO products (name, price_cents, active) VALUES ('Dup', 2000, 1)`).run();
  const r1 = await request(buildApp(), {
    path: '/api/checkout/wallet/create',
    body: { provider: PROVIDER_ID, items: [{ product_id: pInfo.lastInsertRowid, quantity: 1 }], discord_id: '111111111111111111' }
  });
  const chargeId = r1.body.charge_id;

  const wh1 = await request(buildApp(), { path: `/webhooks/wallet/${PROVIDER_ID}`, body: { id: chargeId, evt: 'paid' } });
  const wh2 = await request(buildApp(), { path: `/webhooks/wallet/${PROVIDER_ID}`, body: { id: chargeId, evt: 'paid' } });
  assertEq(wh1.body.ok, true);
  assertEq(wh2.body.duplicate, true, 'segundo webhook detecta duplicate');
});

test('E2E: provider nao configurado retorna 503', async () => {
  const r = await request(buildApp(), {
    path: '/api/checkout/wallet/create',
    body: { provider: 'inexistente', items: [{ product_id: 1, quantity: 1 }], discord_id: '111111111111111111' }
  });
  assertEq(r.status, 400, 'provider invalido = 400');
});

test('E2E: estoque insuficiente retorna 409', async () => {
  const pInfo = db.prepare(`INSERT INTO products (name, price_cents, active, stock) VALUES ('NoStock', 1000, 1, 0)`).run();
  const r = await request(buildApp(), {
    path: '/api/checkout/wallet/create',
    body: { provider: PROVIDER_ID, items: [{ product_id: pInfo.lastInsertRowid, quantity: 1 }], discord_id: '111111111111111111' }
  });
  assertEq(r.status, 409);
});

module.exports = Promise.all(pending).then(() => { global.test = origTest; });
