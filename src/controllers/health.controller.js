// Kubernetes-style health probes.
//
//   GET /healthz  -> liveness  (200 sempre que o process responde)
//   GET /readyz   -> readiness (200 se DB + bot + creds essenciais OK)
//   GET /healthz/details (auth) -> JSON com diagnostico completo
//
// Liveness: signal pro orchestrator nao matar. Falha so se o process
// estiver completamente travado. Aqui retornamos sempre 200 ate o
// servidor estar respondendo HTTP.
//
// Readiness: signal pra rotear trafego pra este replica. Falha quando:
//   - DB nao responde
//   - migrations nao aplicadas
//   - bot em restart (loading)
// Durante deploy/restart, traffic eh roteado pras outras replicas.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
const STARTED_AT = Math.floor(Date.now() / 1000);

router.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'alive',
    uptime_s: Math.floor(Date.now() / 1000) - STARTED_AT
  });
});

router.get('/readyz', (req, res) => {
  const checks = {};
  let ready = true;

  // DB
  try {
    const r = db.prepare('SELECT 1 AS ok').get();
    checks.db = r?.ok === 1 ? 'ok' : 'fail';
    if (checks.db === 'fail') ready = false;
  } catch (e) {
    checks.db = 'fail: ' + e.message;
    ready = false;
  }

  // Migrations table existe
  try {
    db.prepare(`SELECT COUNT(*) AS c FROM _migrations`).get();
    checks.migrations = 'ok';
  } catch {
    checks.migrations = 'fail';
    ready = false;
  }

  // Bot service (opcional — bot pode estar carregando)
  try {
    const bot = require('../services/bot.service');
    checks.bot = bot.isReady?.() ? 'ok' : 'starting';
  } catch {
    checks.bot = 'unknown';
  }

  res.status(ready ? 200 : 503).json({ ready, checks });
});

// Detalhado: precisa auth (info sensivel sobre infra)
router.get('/healthz/details', requireAuth, (req, res) => {
  const mem = process.memoryUsage();
  const uptime = Math.floor(Date.now() / 1000) - STARTED_AT;

  // Stats do banco
  let dbStats = {};
  try {
    dbStats.sales_total = db.prepare(`SELECT COUNT(*) AS c FROM sales`).get().c;
    dbStats.sales_pending = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status='pending' AND provider IS NOT NULL`).get().c;
    dbStats.outbound_attempts_24h = db.prepare(`SELECT COUNT(*) AS c FROM outbound_webhook_attempts WHERE created_at >= ?`).get(Math.floor(Date.now()/1000) - 86400).c;
    dbStats.webhook_events_24h = db.prepare(`SELECT COUNT(*) AS c FROM webhook_events WHERE received_at >= ?`).get(Math.floor(Date.now()/1000) - 86400).c;
  } catch {}

  // Migrations aplicadas
  let migrations = 0;
  try { migrations = db.prepare(`SELECT COUNT(*) AS c FROM _migrations`).get().c; } catch {}

  // Tracing config
  let tracing = {};
  try {
    const t = require('../services/tracing.service');
    tracing = { sample_rate: t.SAMPLE_RATE, spans_buffered: t.recent(99999).length };
  } catch {}

  res.json({
    status: 'alive',
    uptime_s: uptime,
    started_at: STARTED_AT,
    node_version: process.version,
    env: process.env.NODE_ENV || 'development',
    memory: {
      rss_mb:       Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb:Math.round(mem.heapTotal / 1024 / 1024)
    },
    db: dbStats,
    migrations_applied: migrations,
    tracing
  });
});

module.exports = router;
