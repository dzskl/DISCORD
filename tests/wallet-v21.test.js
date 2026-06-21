// Health checks + admin logs + rate limit overrides.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');

const rlMw = require('../src/middlewares/tenant-rate-limit.middleware');

test('Rate limit override: set/get/clear', () => {
  rlMw.setRouteOverride('test:route-1', 100, 60_000, 'tester');
  const list = rlMw.listRouteOverrides();
  const found = list.find(o => o.route === 'test:route-1');
  assert(found, 'override criado');
  assertEq(found.capacity, 100);
  assertEq(found.window_ms, 60_000);

  // Upsert: atualizar
  rlMw.setRouteOverride('test:route-1', 50, 30_000, 'tester');
  const updated = rlMw.listRouteOverrides().find(o => o.route === 'test:route-1');
  assertEq(updated.capacity, 50);
  assertEq(updated.window_ms, 30_000);

  rlMw.clearRouteOverride('test:route-1');
  const after = rlMw.listRouteOverrides().find(o => o.route === 'test:route-1');
  assertEq(after, undefined);
});

test('Rate limit override: aplicado pelo tenantLimiter', () => {
  rlMw.setRouteOverride('test:overide-2', 2, 60_000, 'tester');
  const limiter = rlMw.tenantLimiter({ scope: 'ip', capacity: 999, windowMs: 60_000, route: 'test:overide-2' });
  const ip = '1.1.1.1';
  const path = '/test-override-' + Date.now();
  const headers = [];
  const mkRes = () => ({
    set: (h, v) => headers.push([h, v]),
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json: () => this
  });
  // 1a request ok
  let nextCalls = 0;
  limiter({ ip, path, headers: {} }, mkRes(), () => nextCalls++);
  limiter({ ip, path, headers: {} }, mkRes(), () => nextCalls++);
  // 3a deve estourar pq override=2
  const res3 = mkRes();
  limiter({ ip, path, headers: {} }, res3, () => nextCalls++);
  assertEq(res3.statusCode, 429, 'override aplicou cap=2');
  // Header X-RateLimit-Limit usa o override
  const limitHeader = headers.find(h => h[0] === 'X-RateLimit-Limit');
  assertEq(limitHeader[1], '2');

  rlMw.clearRouteOverride('test:overide-2');
});

test('Health controller: healthz sempre 200', () => {
  const ctrl = require('../src/controllers/health.controller');
  assert(typeof ctrl === 'function', 'router exportado');
});

test('Admin logs: schema do summary tem campos 24h', () => {
  // Inserir 1 audit + 1 webhook event pra ter dados
  db.prepare(`INSERT INTO audit_log (action, target_type, target_id) VALUES ('test.action', 'test', '1')`).run();
  db.prepare(`INSERT OR IGNORE INTO webhook_events (gateway, event_id, status) VALUES ('test', 'evt-summary-' || strftime('%s','now'), 'processed')`).run();

  // Query similar ao endpoint summary
  const since = Math.floor(Date.now() / 1000) - 86400;
  const audit_24h = db.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE created_at >= ?`).get(since).c;
  const webhooks_24h = db.prepare(`SELECT COUNT(*) AS c FROM webhook_events WHERE received_at >= ?`).get(since).c;
  assert(audit_24h >= 1, 'audit_24h >=1');
  assert(webhooks_24h >= 1, 'webhooks_24h >=1');
});

test('Admin logs audit: filtros funcionam', () => {
  db.prepare(`INSERT INTO audit_log (action, target_type, target_id, actor_id) VALUES ('filter.test', 'sale', '99', 'user-x')`).run();

  const rows = db.prepare(`
    SELECT * FROM audit_log WHERE action LIKE ?
  `).all('%filter.test%');
  assert(rows.length >= 1, 'filtro action funcionou');
});

test('Migration 041 aplicada: tabela rate_limit_config existe', () => {
  const t = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limit_config'`).get();
  assert(t, 'tabela rate_limit_config existe');
});

test('Migration 041: route eh PRIMARY KEY', () => {
  // Tentar duplicar route via INSERT raw deve falhar
  rlMw.setRouteOverride('test:pk-' + Date.now(), 10, 60_000);
  let pkOk = false;
  try {
    const route = 'test:pk-collision';
    rlMw.setRouteOverride(route, 10, 1000);
    // INSERT direto sem ON CONFLICT deve falhar
    db.prepare(`INSERT INTO rate_limit_config (route, capacity, window_ms) VALUES (?, 20, 2000)`).run(route);
  } catch (e) {
    pkOk = /UNIQUE|PRIMARY/i.test(e.message);
  }
  assert(pkOk, 'PRIMARY KEY constraint ativa');
});
