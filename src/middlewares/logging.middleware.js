// Middleware de logging HTTP estruturado + correlation ID.
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('../utils/logger');

module.exports = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const id = existing || crypto.randomBytes(8).toString('hex');
    res.setHeader('x-request-id', id);
    return id;
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.headers['x-forwarded-for'] || req.remoteAddress,
      userAgent: req.headers['user-agent']
    }),
    res: (res) => ({ statusCode: res.statusCode })
  },
  autoLogging: {
    ignore: req =>
      req.url.startsWith('/api/checkout/webhook') ||
      req.url.startsWith('/api/billing/webhook') ||
      req.url === '/health' ||
      req.url === '/api/session/health'
  }
});
