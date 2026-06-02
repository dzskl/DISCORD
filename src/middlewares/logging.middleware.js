// Middleware de logging HTTP estruturado.
const pinoHttp = require('pino-http');
const logger = require('../utils/logger');

module.exports = pinoHttp({
  logger,
  autoLogging: {
    ignore: req =>
      req.url.startsWith('/api/checkout/webhook') ||
      req.url.startsWith('/api/billing/webhook')
  }
});
