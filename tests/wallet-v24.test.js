// OpenTelemetry-style tracing + ed25519 signing v3 + Lucene query parser.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');

test('Tracing: start cria span com traceId + spanId hex', () => {
  const t = require('../src/services/tracing.service');
  const s = t.start('test.op');
  assert(/^[0-9a-f]{32}$/.test(s.traceId), 'traceId 16 bytes hex');
  assert(/^[0-9a-f]{16}$/.test(s.spanId), 'spanId 8 bytes hex');
  s.end();
});

test('Tracing: setAttribute + addEvent + setStatus', () => {
  const t = require('../src/services/tracing.service');
  const s = t.start('test.attrs');
  s.setAttribute('foo', 'bar');
  s.addEvent('check', { ok: true });
  s.setStatus(1, 'ok');
  s.end();
  const otlp = t.toOTLP(s);
  const fooAttr = otlp.attributes.find(a => a.key === 'foo');
  assertEq(fooAttr.value.stringValue, 'bar');
  assertEq(otlp.status.code, 1);
  assertEq(otlp.events.length, 1);
});

test('Tracing: parent span propaga traceId', () => {
  const t = require('../src/services/tracing.service');
  const root = t.start('root');
  const child = t.start('child', { parent: root });
  assertEq(child.traceId, root.traceId);
  assertEq(child.parentSpanId, root.spanId);
  child.end(); root.end();
});

test('Tracing: middleware extrai traceparent W3C', () => {
  const { tracingMiddleware } = require('../src/services/tracing.service');
  const headers = {};
  const listeners = {};
  const req = {
    headers: { traceparent: '00-0123456789abcdef0123456789abcdef-fedcba9876543210-01' },
    method: 'GET',
    path: '/test'
  };
  const res = {
    setHeader: (k, v) => headers[k] = v,
    on: (e, fn) => { listeners[e] = fn; },
    statusCode: 200
  };
  tracingMiddleware(req, res, () => {});
  assertEq(req.traceId, '0123456789abcdef0123456789abcdef');
  assertEq(headers['X-Trace-Id'], req.traceId);
  // Dispara finish
  listeners.finish?.();
});

test('Signing v3: getActive bootstrap cria primeira key', () => {
  const s = require('../src/services/signing-keys.service');
  const k = s.getActive();
  assert(k, 'getActive retorna chave');
  assert(k.kid.startsWith('bd_'));
  assertEq(k.algorithm, 'ed25519');
  assert(k.public_key.includes('PUBLIC KEY'));
});

test('Signing v3: sign + verify round-trip', () => {
  const s = require('../src/services/signing-keys.service');
  const body = 'hello world ' + Date.now();
  const r = s.sign(body);
  assert(r.kid);
  assert(r.signature);
  assertEq(s.verify(body, r.signature, r.kid), true, 'verify OK');
  assertEq(s.verify(body + 'tamper', r.signature, r.kid), false, 'tamper rejeitado');
  assertEq(s.verify(body, r.signature, 'kid-falso'), false, 'kid invalido rejeitado');
});

test('Signing v3: rotate gera nova kid', () => {
  const s = require('../src/services/signing-keys.service');
  const before = s.getActive();
  const rotated = s.rotate();
  assert(rotated.kid !== before.kid);
  // Antiga ainda valida (grace period)
  const after = s.getActive();
  assertEq(after.kid, rotated.kid, 'getActive retorna a mais nova');
});

test('Signing v3: listPublic NAO expoe private_key', () => {
  const s = require('../src/services/signing-keys.service');
  const list = s.listPublic();
  assert(list.length >= 1);
  for (const k of list) {
    assert(k.public_key, 'public_key presente');
    assertEq(k.private_key, undefined, 'private_key nao exposto');
  }
});

test('QueryParser: campo:valor simples', () => {
  const { parse } = require('../src/services/query-parser.service');
  const r = parse('action:refund');
  assertEq(r.wheres.length, 1);
  assert(r.wheres[0].includes('action = ?'));
  assertEq(r.args[0], 'refund');
});

test('QueryParser: prefix com *', () => {
  const { parse } = require('../src/services/query-parser.service');
  const r = parse('action:refund*');
  assert(r.wheres[0].includes('LIKE'));
  assertEq(r.args[0], 'refund%');
});

test('QueryParser: numerico com >=', () => {
  const { parse } = require('../src/services/query-parser.service');
  const r = parse('status_code:>=400');
  assert(r.wheres[0].includes('status_code >='));
  assertEq(r.args[0], 400);
});

test('QueryParser: AND implicito + OR explicito', () => {
  const { parse } = require('../src/services/query-parser.service');
  const r = parse('action:refund OR action:dispute');
  assert(r.wheres.length === 1, 'OR junta em uma clause');
  assert(r.wheres[0].includes(' OR '));
});

test('QueryParser: rejeita campos nao permitidos (anti-SQL injection)', () => {
  const { parse } = require('../src/services/query-parser.service');
  const r = parse('password:secret OR users.id:1');
  assertEq(r.wheres.length, 0, 'campos invalidos ignorados');
});

test('QueryParser: campo valido com value entre aspas', () => {
  const { parse } = require('../src/services/query-parser.service');
  const r = parse('action:"with spaces and stuff"');
  assertEq(r.args[0], 'with spaces and stuff');
});

test('Well-known: endpoint retorna keys (sem private)', () => {
  // Direto via service (controller exige express)
  const s = require('../src/services/signing-keys.service');
  const list = s.listPublic();
  for (const k of list) {
    assert(!('private_key' in k), 'private_key nao exposto no listPublic');
  }
});
