// API versioning + webhook signing v2 + SDK generator.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (900,'v18@t','x','owner',1)`).run(); } catch {}

test('API version: sem header usa CURRENT_VERSION', () => {
  const { versionMiddleware, CURRENT_VERSION } = require('../src/middlewares/api-version.middleware');
  const headers = {};
  const req = { headers: {} };
  const res = { setHeader: (k, v) => headers[k] = v, status: () => res, json: () => res };
  let nextCalled = false;
  versionMiddleware(req, res, () => nextCalled = true);
  assert(nextCalled);
  assertEq(req.apiVersion, CURRENT_VERSION);
  assertEq(headers['BotDash-Version'], CURRENT_VERSION);
});

test('API version: header valido eh aceito', () => {
  const { versionMiddleware, SUPPORTED } = require('../src/middlewares/api-version.middleware');
  const v = SUPPORTED[0];
  const headers = {};
  const req = { headers: { 'botdash-version': v } };
  const res = { setHeader: (k, val) => headers[k] = val };
  let nextCalled = false;
  versionMiddleware(req, res, () => nextCalled = true);
  assert(nextCalled);
  assertEq(req.apiVersion, v);
});

test('API version: header invalido -> 400', () => {
  const { versionMiddleware } = require('../src/middlewares/api-version.middleware');
  let statusCode = 200, body = null;
  const req = { headers: { 'botdash-version': '2099-12-31' } };
  const res = {
    setHeader: () => {},
    status(c) { statusCode = c; return res; },
    json(b) { body = b; return res; }
  };
  versionMiddleware(req, res, () => { throw new Error('next nao deveria'); });
  assertEq(statusCode, 400);
  assertEq(body.code, 'invalid_version');
  assert(Array.isArray(body.supported));
});

test('Webhook signing v2: headers v1 + v2 + timestamp enviados', async () => {
  // Stub fetch e captura headers
  const origFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = opts;
    return { status: 200, text: async () => '' };
  };

  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (901,'sv2@t','x','owner',1)`).run(); } catch {}
  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (901, 'http://x.example/hook', 'sv2-secret', '["sale.paid"]')
  `).run();

  const ob = require('../src/services/outbound-webhooks.service');
  await ob.dispatch('sale.paid', { user_id: 901, sale_id: 1 });

  global.fetch = origFetch;

  assert(captured.headers['X-BotDash-Signature'], 'v1 presente');
  assert(captured.headers['X-BotDash-Signature-V2'], 'v2 presente');
  assert(captured.headers['X-BotDash-Timestamp'], 'timestamp presente');

  // Valida v2 manualmente: deve casar com HMAC sha256(timestamp + '.' + body)
  const crypto = require('crypto');
  const ts = captured.headers['X-BotDash-Timestamp'];
  const v2 = captured.headers['X-BotDash-Signature-V2'];
  const expected = 't=' + ts + ',v2=' + crypto.createHmac('sha256', 'sv2-secret').update(ts + '.' + captured.body).digest('hex');
  assertEq(v2, expected);
});

test('Webhook signing v2: User-Agent atualizado pra 2.0', async () => {
  const origFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => { captured = opts; return { status: 200, text: async () => '' }; };

  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (902,'ua@t','x','owner',1)`).run(); } catch {}
  db.prepare(`INSERT INTO outbound_webhooks (user_id, url, secret, events) VALUES (902, 'http://x', 's', '["sale.paid"]')`).run();

  const ob = require('../src/services/outbound-webhooks.service');
  await ob.dispatch('sale.paid', { user_id: 902, sale_id: 1 });
  global.fetch = origFetch;

  assertEq(captured.headers['User-Agent'], 'BotDash-Webhook/2.0');
});

test('SDK generator: parseOpenAPI extrai paths', () => {
  const { parseOpenAPI } = require('../scripts/generate-sdk.js');
  const yaml = `
openapi: 3.0.3
paths:
  /api/foo:
    get:
      summary: List foo
      tags: [Foo]
    post:
      summary: Create foo
  /api/foo/{id}:
    get:
      summary: Get foo
`;
  const paths = parseOpenAPI(yaml);
  assert(paths['/api/foo'], 'path /api/foo extraido');
  assert(paths['/api/foo'].get, 'GET presente');
  assert(paths['/api/foo'].post, 'POST presente');
  assertEq(paths['/api/foo'].get.summary, 'List foo');
  assert(paths['/api/foo/{id}'], 'path com {id}');
});

test('SDK generator: methodName gera nome camelCase', () => {
  const { methodName } = require('../scripts/generate-sdk.js');
  assert(methodName('GET', '/api/checkout/wallet/sales').includes('CheckoutWalletSales'));
  assert(methodName('POST', '/api/checkout/wallet/refund/{sale_id}').includes('CheckoutWalletRefund'));
});

test('SDK gerado: arquivo existe e tem methods', () => {
  const fs = require('fs');
  const path = require('path');
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'botdash-js.js');
  assert(fs.existsSync(f), 'SDK existe');
  const content = fs.readFileSync(f, 'utf8');
  assert(content.includes('class BotDashClient'));
  assert(content.includes('async _request'));
  assert(content.includes('BotDash-Version'));
  assert(content.includes('Idempotency-Key'));
});
