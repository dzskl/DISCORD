// Wallet webhook handler — testa fluxo end-to-end usando o DB real do runner.
//
// Estrategia: registra um connector fake no registry, cria uma sale no DB,
// envia POST pro webhook handler, verifica que a sale foi marcada como paga
// (fulfillment rodou) ou expirada conforme o evento.

const express = require('express');
const http = require('http');
const { db } = require('../src/database/connection');
const { BaseConnector } = require('../src/providers/wallet/base.connector');
const registry = require('../src/providers/wallet');

// Stub bot.service pra nao tentar grant role / DM real
const botPath = require.resolve('../src/services/bot.service');
require.cache[botPath] = {
  exports: { dmUser: async () => true, grantRole: async () => true, restart: async () => true }
};

// Connector fake — devolve o que o body do webhook mandar
class FakeConnector extends BaseConnector {
  constructor() { super({ providerId: 'fake', credentials: {} }); }
  static get REQUIRED_CREDS() { return []; }
  parseWebhook(req) {
    const b = req.body || {};
    return {
      event: b.evt || 'paid',
      external_id: b.id || null,
      amount_cents: b.amount || null,
      paid_at: Math.floor(Date.now() / 1000),
      raw: b
    };
  }
  verifySignature(req, secret) {
    if (!secret) return true;
    return req.headers['x-fake-sig'] === secret;
  }
}
registry.CONNECTORS.fake = FakeConnector;

const webhookRouter = require('../src/controllers/wallet-webhook.controller');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks/wallet', webhookRouter);
  return app;
}

function request(app, { path, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1', port, path, method: 'POST',
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
      req.write(data); req.end();
    });
  });
}

// Coleta todas as promises retornadas por test() async pra que o runner aguarde.
const pending = [];
const origTest = global.test;
global.test = function (n, fn) {
  const r = origTest(n, fn);
  if (r && typeof r.then === 'function') pending.push(r);
  return r;
};

test('Webhook: provider desconhecido -> 404', async () => {
  const r = await request(buildApp(), { path: '/webhooks/wallet/inexistente', body: { id: 'x' } });
  assertEq(r.status, 404);
});

test('Webhook: sem secret aceita sem validar HMAC', async () => {
  const r = await request(buildApp(), { path: '/webhooks/wallet/fake', body: { id: 'no-sale-yet', evt: 'paid' } });
  assertEq(r.status, 200);
  assertEq(r.body.sale_not_found, true);
});

test('Webhook: sale paid dispara fulfillment', async () => {
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id)
    VALUES ('123456789012345678', 5000, 'pending', '[]', 'fake', 'wh-charge-1')
  `).run();
  const saleId = info.lastInsertRowid;

  const r = await request(buildApp(), { path: '/webhooks/wallet/fake', body: { id: 'wh-charge-1', evt: 'paid' } });
  assertEq(r.status, 200);
  assertEq(r.body.ok, true);

  const sale = db.prepare('SELECT status, paid_at FROM sales WHERE id=?').get(saleId);
  assertEq(sale.status, 'paid');
  assert(sale.paid_at > 0);
});

test('Webhook: idempotente (sale ja paga -> duplicate)', async () => {
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at)
    VALUES ('123456789012345678', 5000, 'paid', '[]', 'fake', 'wh-charge-dup', strftime('%s','now'))
  `).run();
  const r = await request(buildApp(), { path: '/webhooks/wallet/fake', body: { id: 'wh-charge-dup', evt: 'paid' } });
  assertEq(r.status, 200);
  assertEq(r.body.duplicate, true);
});

test('Webhook: evento expired marca sale como expired', async () => {
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id)
    VALUES ('123456789012345678', 5000, 'pending', '[]', 'fake', 'wh-charge-exp')
  `).run();
  const r = await request(buildApp(), { path: '/webhooks/wallet/fake', body: { id: 'wh-charge-exp', evt: 'expired' } });
  assertEq(r.status, 200);
  assertEq(r.body.expired, true);
  const sale = db.prepare(`SELECT status FROM sales WHERE provider_charge_id='wh-charge-exp'`).get();
  assertEq(sale.status, 'expired');
});

// Export pending pra que o runner aguarde
module.exports = Promise.all(pending).then(() => { global.test = origTest; });

