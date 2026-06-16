// API keys + outbound webhooks.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const keys = require('../src/services/api-keys.service');

// Garante users.id=10 (sandbox local pra esses testes)
// Cada teste cria seu user dedicado pra evitar race condition entre dispatches
let _testUserCounter = 100;
function makeUser() {
  const id = _testUserCounter++;
  try { db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, role, active) VALUES (?, ?, 'x', 'owner', 1)`).run(id, `u${id}@t`); } catch {}
  return id;
}
try { db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, role, active) VALUES (10, 'apikey@t', 'x', 'owner', 1)`).run(); } catch {}

// Serializa tests async: cada test() retorna uma promise que so comeca
// depois do anterior — evita race no global.fetch e em hooks compartilhados.
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

test('API key: gera com prefix + secret + hash', () => {
  const k = keys.generate({ user_id: 10, label: 'test', scopes: ['read:sales'] });
  assert(k.id > 0);
  assert(k.full_key.startsWith('bd_'));
  // base64url do secret pode conter '_', entao split('_') >= 3
  assert(k.full_key.split('_').length >= 3, 'formato bd_<prefix>_<secret>');
  assert(k.prefix.startsWith('bd_'));
});

test('API key: verify aceita key valida', () => {
  const k = keys.generate({ user_id: 10, label: 'verify-1', scopes: ['read:sales', 'write:refund'] });
  const v = keys.verify(k.full_key);
  assert(v, 'verify retorna objeto');
  assertEq(v.user_id, 10);
  assert(v.scopes.includes('read:sales'));
  assert(v.scopes.includes('write:refund'));
});

test('API key: verify rejeita key revogada', () => {
  const k = keys.generate({ user_id: 10, label: 'revoke-1' });
  keys.revoke(10, k.id);
  assertEq(keys.verify(k.full_key), null);
});

test('API key: verify rejeita token errado', () => {
  assertEq(keys.verify('bd_aaaaaaaa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), null);
  assertEq(keys.verify('lixo'), null);
  assertEq(keys.verify(null), null);
});

test('API key: scopes invalidos sao rejeitados', () => {
  let code = null;
  try { keys.generate({ user_id: 10, scopes: ['admin:everything'] }); }
  catch (e) { code = e.code; }
  assertEq(code, 'bad_scope');
});

test('API key: expires_at honrado', () => {
  const k = keys.generate({ user_id: 10, expires_in_days: -1 });   // ja expirada
  assertEq(keys.verify(k.full_key), null, 'expirada rejeitada');
});

test('Outbound webhook: dispatch envia HMAC + body correto', async () => {
  // Stub fetch
  const origFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { status: 200, text: async () => 'ok' };
  };

  // Cria webhook
  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (?,?,?,?)
  `).run(10, 'https://example.com/hook', 'my-secret', JSON.stringify(['sale.paid']));

  const ob = require('../src/services/outbound-webhooks.service');
  await ob.dispatch('sale.paid', { user_id: 10, sale_id: 999, amount_cents: 5000 });

  global.fetch = origFetch;
  assert(captured, 'fetch chamado');
  assertEq(captured.url, 'https://example.com/hook');
  assertEq(captured.opts.headers['X-BotDash-Event'], 'sale.paid');
  assert(captured.opts.headers['X-BotDash-Signature'].startsWith('sha256='));
  assert(captured.opts.headers['X-BotDash-Delivery']);
  const body = JSON.parse(captured.opts.body);
  assertEq(body.event, 'sale.paid');
  assertEq(body.data.sale_id, 999);
});

test('Outbound webhook: HMAC pode ser verificado com o secret', async () => {
  const crypto = require('crypto');
  const uid = makeUser();
  const origFetch = global.fetch;
  let body = null, sig = null;
  global.fetch = async (url, opts) => {
    body = opts.body; sig = opts.headers['X-BotDash-Signature'];
    return { status: 200, text: async () => '' };
  };
  db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (?,?,?,?)
  `).run(uid, 'https://example.com/sig', 'hmac-secret-12345', JSON.stringify(['sale.paid']));
  const ob = require('../src/services/outbound-webhooks.service');
  await ob.dispatch('sale.paid', { user_id: uid, sale_id: 1 });
  global.fetch = origFetch;

  const expected = 'sha256=' + crypto.createHmac('sha256', 'hmac-secret-12345').update(body).digest('hex');
  assertEq(sig, expected, 'HMAC bate');
});

test('Outbound webhook: 5 falhas consecutivas desabilita o hook', async () => {
  const uid = makeUser();
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error('connection refused'); };

  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (?,?,?,?)
  `).run(uid, 'https://broken.example/hook', 'sec', JSON.stringify(['sale.paid']));

  const ob = require('../src/services/outbound-webhooks.service');
  for (let i = 0; i < 5; i++) {
    await ob.dispatch('sale.paid', { user_id: uid, sale_id: i });
  }
  global.fetch = origFetch;

  const wh = db.prepare(`SELECT active, failure_count, disabled_at FROM outbound_webhooks WHERE id=?`).get(info.lastInsertRowid);
  assertEq(wh.active, 0, 'auto-desabilitado');
  assertEq(wh.failure_count, 5);
  assert(wh.disabled_at > 0);
});

test('Outbound webhook: dispatch filtra eventos nao assinados', async () => {
  const origFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return { status: 200, text: async () => '' }; };

  db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (?,?,?,?)
  `).run(10, 'https://example.com/only-refund', 'sec', JSON.stringify(['sale.refunded']));

  const ob = require('../src/services/outbound-webhooks.service');
  await ob.dispatch('sale.paid', { user_id: 10, sale_id: 1 });
  global.fetch = origFetch;
  // O hook nao assina sale.paid (so refund) — fetch nao deveria ser chamado pra ele.
  // Mas pode ter sido chamado por outro hook (registrado em test anterior). Aceitamos
  // apenas verificar que esse webhook especifico nao gravou tentativa pra 'sale.paid':
  const att = db.prepare(`SELECT COUNT(*) AS c FROM outbound_webhook_attempts WHERE webhook_id=(SELECT id FROM outbound_webhooks WHERE url='https://example.com/only-refund')`).get();
  assertEq(att.c, 0, 'nenhuma tentativa pro hook nao-assinante');
});

test('Outbound webhook: wildcard "*" recebe todos os eventos', async () => {
  const uid = makeUser();
  const origFetch = global.fetch;
  global.fetch = async () => { return { status: 200, text: async () => '' }; };

  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, url, secret, events)
    VALUES (?,?,?,?)
  `).run(uid, 'https://example.com/all', 'sec', JSON.stringify(['*']));

  const ob = require('../src/services/outbound-webhooks.service');
  await ob.dispatch('sale.paid', { user_id: uid, sale_id: 1 });
  await ob.dispatch('sale.refunded', { user_id: uid, sale_id: 1 });

  global.fetch = origFetch;
  const att = db.prepare(`SELECT COUNT(*) AS c FROM outbound_webhook_attempts WHERE webhook_id=?`).get(info.lastInsertRowid);
  assertEq(att.c, 2, 'wildcard recebe os 2 eventos');
});


module.exports = Promise.all(pending).then(() => { global.test = origTest; });
