// Sandbox keys (bd_test_*) + audit log + rate limit headers + OpenAPI.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const keys = require('../src/services/api-keys.service');

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (300,'sb@t','x','owner',1)`).run(); } catch {}

test('API key sandbox: prefix bd_test_*', () => {
  const k = keys.generate({ user_id: 300, label: 'sb', test_mode: true });
  assert(k.prefix.startsWith('bd_test_'), 'prefix sandbox: ' + k.prefix);
  assert(k.full_key.startsWith('bd_test_'));
});

test('API key sandbox: verify retorna test_mode=true', () => {
  const k = keys.generate({ user_id: 300, label: 'sb-v', test_mode: true });
  const v = keys.verify(k.full_key);
  assert(v, 'verify OK');
  assertEq(v.test_mode, true, 'test_mode propagado');
});

test('API key normal: verify retorna test_mode=false', () => {
  const k = keys.generate({ user_id: 300, label: 'normal', test_mode: false });
  const v = keys.verify(k.full_key);
  assertEq(v.test_mode, false);
});

test('API key: secret com underscores nao quebra verify (regressao)', () => {
  // base64url pode conter '_' e '-'. Geramos varias keys e verificamos
  // que verify consegue decodear cada uma.
  for (let i = 0; i < 30; i++) {
    const k = keys.generate({ user_id: 300, label: 'br-' + i });
    const v = keys.verify(k.full_key);
    assert(v, 'key ' + i + ' verify OK: ' + k.full_key);
  }
});

test('Rate limit headers: X-RateLimit-Limit/Reset/Remaining', () => {
  const { tenantLimiter } = require('../src/middlewares/tenant-rate-limit.middleware');
  const limiter = tenantLimiter({ scope: 'ip', capacity: 3, windowMs: 60000 });
  const setHeaders = {};
  const req = { ip: '1.2.3.4', path: '/test-headers-' + Date.now(), headers: {} };
  const res = { set: (h, v) => setHeaders[h] = v, status: () => res, json: () => res };
  let nextCalled = false;
  limiter(req, res, () => nextCalled = true);
  assert(nextCalled, 'next chamado');
  assertEq(setHeaders['X-RateLimit-Limit'], '3');
  assert(setHeaders['X-RateLimit-Reset']);
  assert(setHeaders['X-RateLimit-Remaining']);
});

test('Rate limit 429: inclui Retry-After + headers', () => {
  const { tenantLimiter } = require('../src/middlewares/tenant-rate-limit.middleware');
  const limiter = tenantLimiter({ scope: 'ip', capacity: 1, windowMs: 60000 });
  const headers = {};
  const path = '/rl-429-' + Date.now();
  const req = { ip: '5.6.7.8', path, headers: {} };
  const res = {
    set: (h, v) => headers[h] = v,
    statusCode: 200,
    status(c) { res.statusCode = c; return res; },
    json: () => res
  };
  limiter(req, res, () => {});  // primeira passa
  limiter(req, res, () => {});  // segunda estoura
  assertEq(res.statusCode, 429);
  assert(headers['Retry-After'], 'Retry-After preenchido');
  assertEq(headers['X-RateLimit-Remaining'], '0');
});

test('Audit log: middleware grava linha apos resposta', async () => {
  const k = keys.generate({ user_id: 300, label: 'audit-test', scopes: ['read:sales'] });
  const { apiKeyOrAuth } = require('../src/middlewares/api-key.middleware');

  // Simula req/res com finish event
  const handler = apiKeyOrAuth('read:sales');
  const listeners = {};
  const req = {
    headers: { authorization: `Bearer ${k.full_key}`, 'user-agent': 'test-agent' },
    method: 'GET', path: '/audit-' + Date.now(), ip: '9.9.9.9'
  };
  const res = {
    on(evt, fn) { listeners[evt] = fn; },
    statusCode: 200
  };
  await new Promise(resolve => handler(req, res, resolve));
  // Dispara finish manualmente
  listeners.finish?.();

  const rows = db.prepare(`SELECT * FROM api_key_audit WHERE api_key_id=?`).all(k.id);
  assert(rows.length >= 1, 'audit gravado');
  assertEq(rows[0].method, 'GET');
  assertEq(rows[0].user_id, 300);
});

test('OpenAPI: arquivo existe e contem paths', () => {
  const fs = require('fs');
  const path = require('path');
  const f = path.join(__dirname, '..', 'docs', 'openapi.yaml');
  assert(fs.existsSync(f), 'openapi.yaml existe');
  const content = fs.readFileSync(f, 'utf8');
  assert(content.includes('openapi: 3.0'), 'OpenAPI 3.0');
  assert(content.includes('/api/checkout/wallet/sales'), 'endpoint sales documentado');
  assert(content.includes('/api/checkout/wallet/refund/{sale_id}'), 'refund documentado');
  assert(content.includes('bearerAuth'), 'security scheme presente');
});
