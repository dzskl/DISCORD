// Graceful shutdown: ao receber SIGTERM/SIGINT, para de aceitar novas
// requests, espera in-flight terminarem (max 30s), fecha DB e sai.
//
// Roteamento /readyz comeca a retornar 503 antes do server.close() pra
// que o load balancer (K8s service / nginx) tire trafego desta replica.

const logger = require('../utils/logger');

const TIMEOUT_MS = 30_000;
let shuttingDown = false;
let server = null;

function isShuttingDown() { return shuttingDown; }

function register(httpServer) {
  server = httpServer;

  const handler = (signal) => {
    if (shuttingDown) {
      logger.warn('graceful shutdown ja em andamento — forcando exit');
      process.exit(1);
    }
    shuttingDown = true;
    logger.info({ signal }, 'graceful shutdown iniciado');

    // 1. Para de aceitar conexoes novas; in-flight terminam normal
    const closed = server.close((err) => {
      if (err) {
        logger.error({ err: err.message }, 'erro ao fechar server');
      } else {
        logger.info('server fechado, requests in-flight finalizadas');
      }
      cleanup().finally(() => process.exit(err ? 1 : 0));
    });

    // 2. Timeout duro: se requests demoram demais, abandona
    setTimeout(() => {
      logger.warn({ timeout_ms: TIMEOUT_MS }, 'graceful shutdown timeout, forcando exit');
      cleanup().finally(() => process.exit(1));
    }, TIMEOUT_MS).unref();

    return closed;
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
}

async function cleanup() {
  // Fecha DB (better-sqlite3 nao precisa muito; mas pra ouputs claros)
  try {
    const { db } = require('../database/connection');
    db.close();
    logger.info('DB fechado');
  } catch (e) { logger.warn({ err: e.message }, 'erro fechando DB'); }

  // Para bot (se estiver rodando)
  try {
    const bot = require('./bot.service');
    if (typeof bot.stop === 'function') await bot.stop();
  } catch {}

  // Da uma respiradinha pra logger flush
  await new Promise(r => setTimeout(r, 100));
}

// Middleware: durante shutdown, retorna 503 em /readyz e em qualquer
// nova request POST/PUT/DELETE (so GET livre pra K8s probe).
function shutdownMiddleware(req, res, next) {
  if (!shuttingDown) return next();
  // Probes K8s precisam saber: readyz=fail, healthz ok (ainda vivo)
  if (req.path === '/readyz') return res.status(503).json({ ready: false, reason: 'shutting_down' });
  if (req.path === '/healthz') return next();
  // Write requests: rejeita pra cliente fazer retry em outra replica
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(503).set('Retry-After', '30').json({ error: 'service shutting down' });
  }
  next();
}

module.exports = { register, isShuttingDown, shutdownMiddleware };
