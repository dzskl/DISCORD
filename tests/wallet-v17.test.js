// Idempotency-Key + cleanup + Grafana JSON.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const { idempotent, hashBody, cleanupExpired } = require('../src/middlewares/idempotency.middleware');

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (800,'id@t','x','owner',1)`).run(); } catch {}

function mockReqRes({ key, body, user_id = 800, method = 'POST' }) {
  const req = {
    headers: key ? { 'idempotency-key': key } : {},
    body: body || {},
    appUser: { id: user_id },
    method
  };
  const listeners = { finish: [] };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this._body = JSON.stringify(b); this.headers['Content-Type'] = 'application/json'; for (const fn of listeners.finish) fn(); return this; },
    send(b) { this._body = String(b); for (const fn of listeners.finish) fn(); return this; },
    on(evt, fn) { if (!listeners[evt]) listeners[evt] = []; listeners[evt].push(fn); }
  };
  return { req, res };
}

test('Idempotency: hashBody eh estavel pra mesmo input', () => {
  assertEq(hashBody({ a: 1, b: 2 }), hashBody({ a: 1, b: 2 }));
  assert(hashBody({ a: 1 }) !== hashBody({ a: 2 }));
});

test('Idempotency: sem header, next() chamado normal', () => {
  const { req, res } = mockReqRes({ body: { x: 1 } });
  let nextCalled = false;
  idempotent('/test-no-key')(req, res, () => { nextCalled = true; });
  assert(nextCalled);
});

test('Idempotency: 1a request salva resposta, 2a com mesmo body replays', async () => {
  const handler = idempotent('/test-replay');
  const key = 'idem-test-' + Date.now();
  const body = { sale_id: 1, reason: 'test' };

  // 1a request: executa handler, salva resposta
  const r1 = mockReqRes({ key, body });
  handler(r1.req, r1.res, () => {});
  r1.res.status(200).json({ ok: true, refunded: 100 });

  // 2a request com mesma key + mesmo body: replay
  const r2 = mockReqRes({ key, body });
  handler(r2.req, r2.res, () => { throw new Error('next NAO deveria ter sido chamado'); });
  // Quando replay acontece, status + json sao chamados pelo middleware
  assertEq(r2.res.statusCode, 200);
  assertEq(r2.res.headers['X-Idempotency-Replay'], 'true');
});

test('Idempotency: 2a request com body diferente -> 409', () => {
  const handler = idempotent('/test-conflict');
  const key = 'idem-conflict-' + Date.now();

  const r1 = mockReqRes({ key, body: { x: 1 } });
  handler(r1.req, r1.res, () => {});
  r1.res.status(200).json({ ok: true });

  const r2 = mockReqRes({ key, body: { x: 2 } });   // body diferente
  handler(r2.req, r2.res, () => { throw new Error('nao deveria'); });
  assertEq(r2.res.statusCode, 409);
  const body = JSON.parse(r2.res._body);
  assertEq(body.code, 'idempotency_conflict');
});

test('Idempotency: cleanup remove expiradas', () => {
  // Insere uma key expirada manualmente
  db.prepare(`
    INSERT INTO idempotency_keys (user_id, key, route, request_hash, status_code, response_body, expires_at)
    VALUES (?, ?, ?, ?, 200, '{}', ?)
  `).run(800, 'expired-' + Date.now(), '/cleanup-test', 'hash', Math.floor(Date.now() / 1000) - 100);
  const deleted = cleanupExpired();
  assert(deleted >= 1, 'pelo menos 1 expirada removida');
});

test('Idempotency: chave > 255 chars rejeitada', () => {
  const handler = idempotent('/test-long');
  const { req, res } = mockReqRes({ key: 'x'.repeat(300), body: {} });
  handler(req, res, () => { throw new Error('next nao deveria'); });
  assertEq(res.statusCode, 400);
});

test('Idempotency: cleanup integrado no wallet-cleanup', async () => {
  // Insere expirada
  db.prepare(`
    INSERT INTO idempotency_keys (user_id, key, route, request_hash, status_code, response_body, expires_at)
    VALUES (?, ?, ?, ?, 200, '{}', ?)
  `).run(800, 'wc-' + Date.now(), '/wc-test', 'h', Math.floor(Date.now()/1000) - 1000);
  const r = await require('../src/jobs/wallet-cleanup').run();
  assert(typeof r.idempotency_keys_deleted === 'number', 'stats.idempotency_keys_deleted presente');
});

test('Grafana dashboard JSON: valido + 14 paineis', () => {
  const fs = require('fs');
  const path = require('path');
  const f = path.join(__dirname, '..', 'docs', 'grafana-dashboard.json');
  const json = JSON.parse(fs.readFileSync(f, 'utf8'));
  assertEq(json.title, 'BotDash — Wallet');
  assertEq(json.panels.length, 14);
  // Verifica que todos os panels tem targets
  for (const p of json.panels) {
    assert(Array.isArray(p.targets), `panel ${p.id} tem targets`);
    assert(p.targets.length > 0, `panel ${p.id} tem pelo menos 1 target`);
  }
});

test('OpenAPI: endpoints novos documentados', () => {
  const fs = require('fs');
  const path = require('path');
  const yaml = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
  assert(yaml.includes('/api/api-keys:'), 'api-keys path');
  assert(yaml.includes('/api/outbound-webhooks:'), 'outbound-webhooks path');
  assert(yaml.includes('rotate-secret'), 'rotate-secret documentado');
  assert(yaml.includes('source-ips'), 'source-ips documentado');
  assert(yaml.includes('Idempotency-Key'), 'idempotency-key documentado');
});
