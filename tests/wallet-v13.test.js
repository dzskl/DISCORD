// Pagination cursor + rotation + SSE.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const keys = require('../src/services/api-keys.service');

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (400,'pg@t','x','owner',1)`).run(); } catch {}

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

test('Rotation: revoga antiga e gera nova com mesmos scopes', () => {
  const k1 = keys.generate({ user_id: 400, label: 'rot-1', scopes: ['read:sales', 'write:refund'] });
  const k2 = keys.rotate(400, k1.id);
  assert(k2, 'rotate retorna nova chave');
  assert(k2.full_key.startsWith('bd_'));
  assert(k2.full_key !== k1.full_key, 'chave eh diferente');
  // Antiga revogada
  assertEq(keys.verify(k1.full_key), null, 'antiga nao valida mais');
  // Nova vale com mesmos scopes
  const v = keys.verify(k2.full_key);
  assert(v.scopes.includes('read:sales'));
  assert(v.scopes.includes('write:refund'));
});

test('Rotation: preserva test_mode', () => {
  const k1 = keys.generate({ user_id: 400, label: 'rot-test', test_mode: true });
  const k2 = keys.rotate(400, k1.id);
  assert(k2.full_key.startsWith('bd_test_'));
  assertEq(keys.verify(k2.full_key).test_mode, true);
});

test('Rotation: chave inexistente -> null', () => {
  assertEq(keys.rotate(400, 99999), null);
});

test('Rotation: chave de outro user -> null (isolamento)', () => {
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (401,'other@t','x','owner',1)`).run(); } catch {}
  const k = keys.generate({ user_id: 401, label: 'other' });
  assertEq(keys.rotate(400, k.id), null, 'usuario 400 nao consegue rotacionar chave do 401');
});

test('Paginacao: cursor after_id avanca pela lista', () => {
  // Cria 5 sales pra user_id=400
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at)
      VALUES ('111111111111111111', 1000, 'paid', '[]', 'mercadopago', ?, strftime('%s','now'))
    `).run(`pg-${i}`);
    ids.push(r.lastInsertRowid);
  }
  // Pagina 1: limit 2
  const p1 = db.prepare(`
    SELECT id FROM sales
    WHERE provider IS NOT NULL AND status='paid' AND provider_charge_id LIKE 'pg-%'
    ORDER BY id DESC LIMIT 2
  `).all();
  assertEq(p1.length, 2);
  // Pagina 2: after_id = ultimo da pagina 1
  const p2 = db.prepare(`
    SELECT id FROM sales
    WHERE provider IS NOT NULL AND status='paid' AND provider_charge_id LIKE 'pg-%' AND id < ?
    ORDER BY id DESC LIMIT 2
  `).all(p1[1].id);
  assertEq(p2.length, 2);
  assert(p2[0].id < p1[1].id, 'pagina 2 vem depois');
});

test('SSE: emit dispara listener filtrando por user_id', async () => {
  const sse = require('../src/services/sse.service');
  let received = null;
  const listener = ({ event, payload }) => {
    if (payload.user_id === 999) received = { event, payload };
  };
  sse.bus.on('event', listener);
  sse.emit('sale.paid', { user_id: 999, sale_id: 1, amount_cents: 5000 });
  // O emit eh sync mas o listener tb. Pequeno tick pra garantir.
  await new Promise(r => setTimeout(r, 5));
  sse.bus.off('event', listener);
  assert(received, 'listener pegou o evento');
  assertEq(received.event, 'sale.paid');
  assertEq(received.payload.sale_id, 1);
});

test('SSE: attach escreve headers SSE corretos', () => {
  const sse = require('../src/services/sse.service');
  const headers = {};
  const writes = [];
  const listeners = {};
  const req = { on: (e, fn) => { listeners[e] = fn; } };
  const res = {
    writeHead: (code, h) => { headers.code = code; Object.assign(headers, h); },
    write: (s) => writes.push(s),
    on: (e, fn) => { listeners[e + '_res'] = fn; }
  };
  sse.attach(req, res, { userId: 1, guildId: null, scopes: [] });
  assertEq(headers.code, 200);
  assertEq(headers['Content-Type'], 'text/event-stream');
  assertEq(headers['Cache-Control'], 'no-cache, no-transform');
  assert(writes.some(w => w.includes('event: connected')), 'evento de conexao enviado');
  // Limpa listeners
  listeners.close?.();
});
