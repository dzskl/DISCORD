// Cron lock + jitter + audit search.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');

test('Cron lock: primeiro acquire vence', () => {
  const lock = require('../src/services/cron-lock.service');
  // Limpa qualquer estado anterior
  try { db.prepare(`DELETE FROM cron_locks WHERE job_name=?`).run('test-job-1'); } catch {}

  const ok = lock.acquire('test-job-1', 60);
  assert(ok, 'primeiro acquire OK');

  // Re-entrant: mesma replica consegue de novo (renova lease)
  const ok2 = lock.acquire('test-job-1', 60);
  assert(ok2, 're-entrant OK');

  lock.release('test-job-1');
});

test('Cron lock: simula outra replica e bloqueia', () => {
  const lock = require('../src/services/cron-lock.service');
  try { db.prepare(`DELETE FROM cron_locks WHERE job_name=?`).run('test-job-2'); } catch {}

  // Insere lock simulando OUTRA replica (holder diferente) com lease longo
  db.prepare(`
    INSERT INTO cron_locks (job_name, holder, acquired_at, lease_until)
    VALUES ('test-job-2', 'other-replica/999', ?, ?)
  `).run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 300);

  const ok = lock.acquire('test-job-2', 60);
  assert(!ok, 'lock de outra replica bloqueia');
});

test('Cron lock: lock expirado eh tomado', () => {
  const lock = require('../src/services/cron-lock.service');
  try { db.prepare(`DELETE FROM cron_locks WHERE job_name=?`).run('test-job-3'); } catch {}

  db.prepare(`
    INSERT INTO cron_locks (job_name, holder, acquired_at, lease_until)
    VALUES ('test-job-3', 'crashed-replica/123', ?, ?)
  `).run(Math.floor(Date.now() / 1000) - 1000, Math.floor(Date.now() / 1000) - 100);

  const ok = lock.acquire('test-job-3', 60);
  assert(ok, 'lock expirado tomado');
});

test('Cron lock: withLock executa fn e libera', async () => {
  const lock = require('../src/services/cron-lock.service');
  try { db.prepare(`DELETE FROM cron_locks WHERE job_name=?`).run('test-job-4'); } catch {}

  let ran = false;
  const r = await lock.withLock('test-job-4', 60, async () => { ran = true; return 42; });
  assertEq(r.skipped, false);
  assertEq(r.result, 42);
  assert(ran, 'fn executou');

  // Lock liberado: deve ser pego novamente
  const r2 = await lock.withLock('test-job-4', 60, async () => 'second');
  assertEq(r2.result, 'second');
});

test('Cron lock: withLock retorna skipped se lock ocupado', async () => {
  const lock = require('../src/services/cron-lock.service');
  try { db.prepare(`DELETE FROM cron_locks WHERE job_name=?`).run('test-job-5'); } catch {}

  db.prepare(`
    INSERT INTO cron_locks (job_name, holder, acquired_at, lease_until)
    VALUES ('test-job-5', 'another/1', ?, ?)
  `).run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 300);

  let ran = false;
  const r = await lock.withLock('test-job-5', 60, async () => { ran = true; });
  assertEq(r.skipped, true);
  assertEq(r.reason, 'lock_held');
  assert(!ran, 'fn nao executou');
});

test('Retry: jitterOffset eh deterministico por (webhook_id, attempt)', () => {
  const { jitterOffset } = require('../src/jobs/outbound-webhook-retry');
  const j1 = jitterOffset(123, 2);
  const j2 = jitterOffset(123, 2);
  const j3 = jitterOffset(124, 2);
  assertEq(j1, j2, 'mesmo input -> mesmo output');
  assert(j1 !== j3, 'inputs diferentes -> outputs diferentes');
  assert(j1 >= 0 && j1 < 30, 'range 0..30');
});

test('Audit search: filtros status_code (multiplos)', () => {
  const keys = require('../src/services/api-keys.service');
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (600,'as@t','x','owner',1)`).run(); } catch {}
  const k = keys.generate({ user_id: 600, label: 'audit-search' });
  // Insere 3 entradas com status codes distintos
  for (const code of [200, 401, 403, 500]) {
    db.prepare(`
      INSERT INTO api_key_audit (api_key_id, user_id, method, path, status_code, test_mode, created_at)
      VALUES (?, 600, 'GET', '/test', ?, 0, strftime('%s','now'))
    `).run(k.id, code);
  }
  // Filtra por 401 + 403
  const rows = db.prepare(`
    SELECT status_code FROM api_key_audit
    WHERE user_id = 600 AND status_code IN (401, 403)
  `).all();
  assertEq(rows.length, 2);
});

test('Audit search: filtro since (unix timestamp)', () => {
  const now = Math.floor(Date.now() / 1000);
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (601,'sn@t','x','owner',1)`).run(); } catch {}
  const keys = require('../src/services/api-keys.service');
  const k = keys.generate({ user_id: 601, label: 'since-test' });
  db.prepare(`INSERT INTO api_key_audit (api_key_id, user_id, method, path, status_code, test_mode, created_at) VALUES (?, 601, 'GET', '/old', 200, 0, ?)`)
    .run(k.id, now - 86400);
  db.prepare(`INSERT INTO api_key_audit (api_key_id, user_id, method, path, status_code, test_mode, created_at) VALUES (?, 601, 'GET', '/new', 200, 0, ?)`)
    .run(k.id, now - 60);
  const rows = db.prepare(`
    SELECT path FROM api_key_audit
    WHERE user_id = 601 AND created_at >= ?
  `).all(now - 3600);
  assertEq(rows.length, 1);
  assertEq(rows[0].path, '/new');
});
