// Server-Sent Events: stream em tempo real de eventos da wallet pro cliente.
//
// GET /api/checkout/wallet/stream (cookie auth ou Bearer com read:sales)
//   - Mantem conexao aberta, envia eventos como text/event-stream
//   - Filtra eventos pelo user_id do cliente
//   - Heartbeat a cada 25s pra evitar timeout em proxies
//
// Eventos emitidos: sale.paid, sale.refunded, sale.med_returned
//   data: { event, sale_id, amount_cents, provider, ... }

const EventEmitter = require('events');

// Bus global em memoria (single-process). Pra multi-replica usar Redis pubsub.
const bus = new EventEmitter();
bus.setMaxListeners(1000);   // ate 1000 conexoes SSE simultaneas

function emit(event, payload) {
  bus.emit('event', { event, payload, at: Date.now() });
}

function attach(req, res, { userId, guildId, scopes }) {
  // Headers SSE
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no'   // Nginx: nao bufferiza
  });
  res.write(`retry: 5000\n\n`);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, user_id: userId })}\n\n`);

  const listener = ({ event, payload, at }) => {
    if (payload.user_id !== userId) return;
    if (guildId && payload.guild_id && payload.guild_id !== guildId) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify({ event, data: payload, at })}\n\n`);
    } catch {}
  };
  bus.on('event', listener);

  // Heartbeat 25s (comment line ': ping')
  const heartbeat = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch {}
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    bus.off('event', listener);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
}

module.exports = { emit, attach, bus };
