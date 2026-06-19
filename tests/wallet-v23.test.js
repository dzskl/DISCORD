// Maintenance mode + backup + cache layer.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const flags = require('../src/services/system-flags.service');
const cache = require('../src/services/cache.service');

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

test('System flags: set/get/isOn', () => {
  flags.set('test_flag_1', 'hello');
  assertEq(flags.get('test_flag_1'), 'hello');
  flags.set('test_flag_2', '1');
  assertEq(flags.isOn('test_flag_2'), true);
  flags.set('test_flag_3', '0');
  assertEq(flags.isOn('test_flag_3'), false);
  assertEq(flags.isOn('nonexistent'), false);
});

test('System flags: list retorna array de {key, value}', () => {
  flags.set('list_test_1', 'a');
  flags.set('list_test_2', 'b');
  const list = flags.list();
  assert(Array.isArray(list));
  const keys = list.map(f => f.key);
  assert(keys.includes('list_test_1'));
  assert(keys.includes('list_test_2'));
});

test('System flags: set upsert atualiza valor existente', () => {
  flags.set('upsert_test', 'v1');
  flags.set('upsert_test', 'v2');
  assertEq(flags.get('upsert_test'), 'v2');
});

test('Maintenance: middleware libera GET sempre', () => {
  flags.set('maintenance_mode', '1');
  const { maintenanceMiddleware } = require('../src/middlewares/maintenance.middleware');
  let nextCalled = false;
  maintenanceMiddleware({ method: 'GET', path: '/api/anything' }, {}, () => nextCalled = true);
  assert(nextCalled);
  flags.set('maintenance_mode', '0');
});

test('Maintenance: middleware bloqueia POST em rotas comuns', () => {
  flags.set('maintenance_mode', '1');
  const { maintenanceMiddleware } = require('../src/middlewares/maintenance.middleware');
  let statusCode = 0, body = null;
  const res = {
    setHeader: () => {},
    status(c) { statusCode = c; return res; },
    json(b) { body = b; return res; }
  };
  maintenanceMiddleware({ method: 'POST', path: '/api/checkout/wallet/create' }, res, () => { throw new Error('nao deveria'); });
  assertEq(statusCode, 503);
  assertEq(body.code, 'maintenance_mode');
  flags.set('maintenance_mode', '0');
});

test('Maintenance: libera /healthz, /readyz, /api/admin/*', () => {
  flags.set('maintenance_mode', '1');
  const { maintenanceMiddleware } = require('../src/middlewares/maintenance.middleware');
  for (const path of ['/healthz', '/readyz', '/metrics', '/api/admin/logs/flags', '/auth/login']) {
    let nextCalled = false;
    maintenanceMiddleware({ method: 'POST', path }, {}, () => nextCalled = true);
    assert(nextCalled, path + ' deveria passar');
  }
  flags.set('maintenance_mode', '0');
});

test('Cache: set + get + del', async () => {
  await cache.set('test:key1', { foo: 'bar' });
  const v = await cache.get('test:key1');
  assertEq(v.foo, 'bar');
  await cache.del('test:key1');
  const v2 = await cache.get('test:key1');
  assertEq(v2, null);
});

test('Cache: TTL expirado retorna null', async () => {
  await cache.set('test:ttl', 'expira', { ttl: -1 });   // ja expirou
  const v = await cache.get('test:ttl');
  assertEq(v, null);
});

test('Cache: getOrSet computa e cacheia uma vez', async () => {
  let computeCount = 0;
  const compute = () => { computeCount++; return 'computed-' + computeCount; };
  const v1 = await cache.getOrSet('test:goset', 60, compute);
  const v2 = await cache.getOrSet('test:goset', 60, compute);
  assertEq(v1, v2);
  assertEq(computeCount, 1, 'compute chamado apenas 1x');
});

test('Cache: LRU evicta antigas ao passar MAX_ENTRIES', async () => {
  // Limpa antes
  const stats = cache.stats();
  // Insere muitos itens
  for (let i = 0; i < 100; i++) {
    await cache.set('lru:' + i, i);
  }
  const after = cache.stats();
  assert(after.size <= after.max, 'respeita max');
});

test('Backup info: schema retornado', () => {
  // Direto via SQL (controller exige requireOwner)
  try {
    const tables = db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'`).get().c;
    assert(tables > 0);
    const migrations = db.prepare(`SELECT COUNT(*) AS c FROM _migrations`).get().c;
    assert(migrations > 0);
  } catch (e) {
    throw new Error('backup info query falhou: ' + e.message);
  }
});

test('Backup: VACUUM INTO produz arquivo SQLite valido', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpFile = path.join(os.tmpdir(), `bk-test-${Date.now()}.sqlite`);
  db.prepare(`VACUUM INTO ?`).run(tmpFile);
  const stat = fs.statSync(tmpFile);
  assert(stat.size > 0, 'arquivo nao vazio');
  // Abre o backup pra confirmar que eh SQLite valido
  const Database = require('better-sqlite3');
  const bk = new Database(tmpFile, { readonly: true });
  const cnt = bk.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'`).get().c;
  assert(cnt > 0, 'backup tem tabelas');
  bk.close();
  fs.unlinkSync(tmpFile);
});

module.exports = Promise.all(pending).then(() => { global.test = origTest; });
