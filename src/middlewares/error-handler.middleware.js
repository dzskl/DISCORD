// Handler de erro global.
const logger = require('../utils/logger');

module.exports = function errorHandler(err, req, res, next) {
  logger.error({ err: err.message, url: req.url, stack: err.stack }, 'request failed');
  const isProd = process.env.NODE_ENV === 'production';
  const isClient = err.status && err.status >= 400 && err.status < 500;
  const safeMsg = isClient || !isProd ? err.message : 'erro interno';
  res.status(err.status || 500).json({ error: safeMsg });
};
