// Request ID: adiciona X-Request-Id em todas as responses pra correlation
// em logs distribuidos. Usa request-id do cliente se vier, senao gera.
//
// Inclui no logger.info via req.log (pino-style helper).

const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  // Aceita request-id externo so se for safe (alfanum + hifen, max 64)
  const valid = incoming && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming);
  const id = valid ? incoming : 'req_' + crypto.randomBytes(8).toString('hex');
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestIdMiddleware };
