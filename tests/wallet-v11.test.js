// Rate limit por API key + outbound webhook retry.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const { take } = require('../src/middlewares/tenant-rate-limit.middleware');

// Tests sequenciais (alguns sao async)
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

test('take(): consome tokens dentro do limite', () => {
  const key = `t1:${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    const r = take(key, 5, 60000);
    assert(r.ok, 'iter ' + i + ' OK');
  }
  const r = take(key, 5, 60000);
  assert(!r.ok, 'estourou');
  assert(r.retry_after_ms > 0);
});

test('peekApiKey: popula req.apiKey quando Bearer bd_ presente', () => {
  const { peekApiKey } = require('../src/middlewares/api-key.middleware');
  const keys = require('../src/services/api-keys.service');
  // Cria user + key
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (200,'p@t','x','owner',1)`).run(); } catch {}
  const k = keys.generate({ user_id: 200, label: 'peek', scopes: ['read:sales'] });

  let captured = null;
  const req = { headers: { authorization: `Bearer ${k.full_key}` } };
  peekApiKey(req, {}, () => { captured = req.apiKey; });
  assert(captured, 'apiKey populado');
  assertEq(captured.id, k.id);
  assert(captured.scopes.includes('read:sales'));
});

test('peekApiKey: sem Bearer nao popula', () => {
  const { peekApiKey } = require('../src/middlewares/api-key.middleware');
  const req = { headers: {} };
  peekApiKey(req, {}, () => {});
  assertEq(req.apiKey, undefined);
});

test('peekApiKey: Bearer invalido nao popula (lax)', () => {
  const { peekApiKey } = require('../src/middlewares/api-key.middleware');
  const req = { headers: { authorization: 'Bearer bd_invalido' } };
  peekApiKey(req, {}, () => {});
  assertEq(req.apiKey, undefined);
});

test('Outbound retry: schedule define 4 niveis', () => {
  const { SCHEDULE } = require('../src/jobs/outbound-webhook-retry');
  assertEq(SCHEDULE.length, 4);
  // Cada entry: [minAge, maxAge, attemptNumber]
  for (const [min, max, n] of SCHEDULE) {
    assert(min < max, 'janela valida');
    assert(n >= 2 && n <= 5, 'attempt 2-5');
  }
});

test('Outbound retry: dispara attempt #2 30s apos falha', async () => {
  // Cria user, webhook, attempt #1 falhada 60s atras
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (201,'r@t','x','owner',1)`).run(); } catch {}
  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events, active)
    VALUES (?,?,?,?,1)
  `).run(201, 'https://retry.example/hook', 'sec', JSON.stringify(['sale.paid']));
  const hookId = info.lastInsertRowid;
  const past = Math.floor(Date.now() / 1000) - 60;
  db.prepare(`
    INSERT INTO outbound_webhook_attempts
      (webhook_id, event, payload, status_code, error, attempt_number, succeeded, created_at)
    VALUES (?, 'sale.paid', '{"event":"sale.paid","data":{"sale_id":1}}', 500, 'first fail', 1, 0, ?)
  `).run(hookId, past);

  // Stub fetch retornando sucesso pra a tentativa de retry
  const origFetch = global.fetch;
  let retryUrl = null;
  global.fetch = async (url) => { retryUrl = url; return { status: 200, text: async () => '' }; };

  const r = await require('../src/jobs/outbound-webhook-retry').run();
  global.fetch = origFetch;

  assert(r.retried >= 1, 'pelo menos 1 retry: ' + r.retried);
  assertEq(retryUrl, 'https://retry.example/hook');

  // Verifica que attempt #2 foi criada
  const a2 = db.prepare(`SELECT * FROM outbound_webhook_attempts WHERE webhook_id=? AND attempt_number=2`).get(hookId);
  assert(a2, 'attempt #2 criada');
  assertEq(a2.succeeded, 1);
});

test('Outbound retry: nao re-tenta webhook desativado', async () => {
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (202,'r2@t','x','owner',1)`).run(); } catch {}
  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events, active)
    VALUES (?,?,?,?,0)
  `).run(202, 'https://disabled.example/hook', 'sec', JSON.stringify(['sale.paid']));
  const hookId = info.lastInsertRowid;
  const past = Math.floor(Date.now() / 1000) - 60;
  db.prepare(`
    INSERT INTO outbound_webhook_attempts
      (webhook_id, event, payload, attempt_number, succeeded, created_at)
    VALUES (?, 'sale.paid', '{"data":{}}', 1, 0, ?)
  `).run(hookId, past);

  const origFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return { status: 200, text: async () => '' }; };

  await require('../src/jobs/outbound-webhook-retry').run();
  global.fetch = origFetch;

  assertEq(called, false, 'fetch nao chamado pra hook desativado');
});

module.exports = Promise.all(pending).then(() => { global.test = origTest; });
