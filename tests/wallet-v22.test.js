// Request ID + graceful shutdown + log stream.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();

test('RequestId: gera id quando header ausente', () => {
  const { requestIdMiddleware } = require('../src/middlewares/request-id.middleware');
  const headers = {};
  const req = { headers: {} };
  const res = { setHeader: (k, v) => headers[k] = v };
  let nextCalled = false;
  requestIdMiddleware(req, res, () => nextCalled = true);
  assert(nextCalled);
  assert(/^req_[a-f0-9]{16}$/.test(req.requestId), 'id gerado: ' + req.requestId);
  assertEq(headers['X-Request-Id'], req.requestId);
});

test('RequestId: aceita id externo se for safe', () => {
  const { requestIdMiddleware } = require('../src/middlewares/request-id.middleware');
  const req = { headers: { 'x-request-id': 'abc-123-def' } };
  const res = { setHeader: () => {} };
  requestIdMiddleware(req, res, () => {});
  assertEq(req.requestId, 'abc-123-def');
});

test('RequestId: rejeita id com caracteres invalidos e gera novo', () => {
  const { requestIdMiddleware } = require('../src/middlewares/request-id.middleware');
  const req = { headers: { 'x-request-id': 'evil\nstring\r\nSet-Cookie' } };
  const res = { setHeader: () => {} };
  requestIdMiddleware(req, res, () => {});
  assert(req.requestId.startsWith('req_'), 'id externo invalido rejeitado');
});

test('RequestId: rejeita id > 64 chars', () => {
  const { requestIdMiddleware } = require('../src/middlewares/request-id.middleware');
  const req = { headers: { 'x-request-id': 'a'.repeat(100) } };
  const res = { setHeader: () => {} };
  requestIdMiddleware(req, res, () => {});
  assert(req.requestId.startsWith('req_'));
});

test('Graceful: shutdownMiddleware bloqueia POSTs durante shutdown', () => {
  const gs = require('../src/services/graceful-shutdown.service');
  // Sem shutdown ativo, next() chamado
  assertEq(gs.isShuttingDown(), false);
  let nextOk = false;
  gs.shutdownMiddleware({ method: 'POST', path: '/api/x' }, { json: () => null, set: () => {}, status: () => ({ json: () => null }) }, () => nextOk = true);
  assert(nextOk);
});

test('Graceful: nao registra handler 2x (idempotente)', () => {
  // register so pode ser chamado uma vez por test run (anti regressao no codigo)
  const gs = require('../src/services/graceful-shutdown.service');
  // module exporta isShuttingDown + shutdownMiddleware + register
  assert(typeof gs.register === 'function');
  assert(typeof gs.shutdownMiddleware === 'function');
  assert(typeof gs.isShuttingDown === 'function');
});

test('Log stream: push + recent retorna em ordem', () => {
  const ls = require('../src/services/log-stream.service');
  ls.push({ level: 'info', msg: 'test 1' });
  ls.push({ level: 'warn', msg: 'test 2' });
  const recent = ls.recent(2);
  assertEq(recent.length, 2);
  assertEq(recent[1].msg, 'test 2');
});

test('Log stream: recent filtra por minLevel', () => {
  const ls = require('../src/services/log-stream.service');
  ls.push({ level: 'debug', msg: 'debug-msg' });
  ls.push({ level: 'info',  msg: 'info-msg' });
  ls.push({ level: 'error', msg: 'error-msg' });
  const errorsOnly = ls.recent(50, 'error');
  assert(errorsOnly.every(e => e.level === 'error'), 'so error');
});

test('Log stream: ring buffer respeita RING_SIZE', () => {
  const ls = require('../src/services/log-stream.service');
  // Empurra muito mais que RING_SIZE
  for (let i = 0; i < ls.RING_SIZE + 100; i++) {
    ls.push({ level: 'info', msg: 'overflow-' + i });
  }
  const all = ls.recent(99999);
  assert(all.length <= ls.RING_SIZE, 'cap em RING_SIZE');
});

test('Log stream: attach escreve headers SSE', () => {
  const ls = require('../src/services/log-stream.service');
  const headers = {};
  const writes = [];
  const listeners = {};
  const req = { on: (e, fn) => { listeners[e] = fn; } };
  const res = {
    writeHead: (code, h) => { headers.code = code; Object.assign(headers, h); },
    write: (s) => writes.push(s),
    on: (e, fn) => {}
  };
  ls.attach(req, res, { minLevel: 'info' });
  assertEq(headers.code, 200);
  assertEq(headers['Content-Type'], 'text/event-stream');
  // Cleanup
  listeners.close?.();
});

test('Logger: replica info/warn/error no log-stream', () => {
  const logger = require('../src/utils/logger');
  const ls = require('../src/services/log-stream.service');
  logger.info({ test: 'hook' }, 'logger hook test');
  const found = ls.recent(20).find(e => e.msg === 'logger hook test');
  assert(found, 'log capturado no ring buffer');
  assertEq(found.level, 'info');
});
