// Log streaming pra admin via SSE — broadcaster simples in-memory que
// recebe logs estruturados e fan-outs pra clientes conectados.
//
// Capacidade: ring buffer dos ultimos 500 eventos pra novos clientes
// receberem o tail recente ao conectar (igual `tail -n 500 -f`).
//
// Uso (em qualquer service):
//   require('./log-stream.service').push({ level: 'info', msg: '...' });

const EventEmitter = require('events');

const RING_SIZE = 500;
const ring = [];                 // ultimos N eventos
const bus = new EventEmitter();
bus.setMaxListeners(50);

function push(entry) {
  const event = {
    level: entry.level || 'info',
    msg: entry.msg || '',
    ...entry,
    at: Date.now()
  };
  ring.push(event);
  if (ring.length > RING_SIZE) ring.shift();
  bus.emit('log', event);
}

function recent(n = 100, filterLevel = null) {
  let slice = ring.slice(-Math.min(n, RING_SIZE));
  if (filterLevel) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const min = levels.indexOf(filterLevel);
    if (min >= 0) slice = slice.filter(e => levels.indexOf(e.level) >= min);
  }
  return slice;
}

function attach(req, res, { minLevel = 'info' } = {}) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`retry: 5000\n\n`);

  // Tail recente
  for (const e of recent(50, minLevel)) {
    try { res.write(`data: ${JSON.stringify(e)}\n\n`); } catch {}
  }

  const levels = ['debug', 'info', 'warn', 'error'];
  const minIdx = Math.max(0, levels.indexOf(minLevel));

  const listener = (entry) => {
    if (levels.indexOf(entry.level) < minIdx) return;
    try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
  };
  bus.on('log', listener);

  const heartbeat = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch {}
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    bus.off('log', listener);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
}

module.exports = { push, recent, attach, bus, RING_SIZE };
