// Logger estruturado (Pino) + integracao opcional com Sentry.
// Set SENTRY_DSN nas env vars pra ativar tracking de erros em producao.

const pino = require('pino');

const pretty = process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY === '1';
let stream;
if (pretty) {
  try {
    stream = pino.transport({ target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } });
  } catch { stream = undefined; }
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'botdash-api',
    version: process.env.GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || 'dev'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['*.password', '*.password_hash', '*.totp_secret', '*.client_secret', 'req.headers.authorization', 'req.headers.cookie', '*.pix_key'],
    censor: '[REDACTED]'
  }
}, stream);

// Sentry — carrega lazy se DSN configurado
let sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    sentry = require('@sentry/node');
    sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE) || 0.1
    });
    logger.info({ dsn_present: true }, 'sentry inicializado');
  } catch (e) {
    logger.warn({ err: e.message }, 'sentry init falhou (pacote @sentry/node nao instalado — npm i @sentry/node)');
    sentry = null;
  }
}

logger.captureException = function (err, context) {
  if (sentry) {
    try { sentry.captureException(err, context ? { extra: context } : undefined); } catch {}
  }
};

logger.captureMessage = function (msg, level, context) {
  if (sentry) {
    try { sentry.captureMessage(msg, { level: level || 'info', extra: context }); } catch {}
  }
};

// Patch do .error pra mandar pro Sentry automaticamente
const origError = logger.error.bind(logger);
logger.error = function (objOrMsg, msg) {
  origError(objOrMsg, msg);
  if (sentry && objOrMsg && (objOrMsg.err || objOrMsg instanceof Error)) {
    const err = objOrMsg instanceof Error ? objOrMsg : objOrMsg.err;
    if (err) {
      try { sentry.captureException(err, { extra: objOrMsg }); } catch {}
    }
  }
};

// Hook: replica logs no log-stream service pra admin SSE consumir.
// So ativa quando log-stream esta carregado (evita require ciclico).
for (const level of ['info', 'warn', 'error']) {
  const orig = logger[level].bind(logger);
  logger[level] = function (...args) {
    orig(...args);
    try {
      const stream = require.cache[require.resolve('../services/log-stream.service')];
      if (stream?.exports?.push) {
        const obj = typeof args[0] === 'object' ? args[0] : {};
        const msg = typeof args[args.length - 1] === 'string' ? args[args.length - 1] : '';
        stream.exports.push({ level, msg, ...obj });
      }
    } catch {}
  };
}

module.exports = logger;
