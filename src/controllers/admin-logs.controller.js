// Logs estruturados pra admin: agrega audit_log, webhook_events e
// rate_limit_violations num endpoint unificado com filtros.
//
// Acesso: requireOwner (so o owner global).

const express = require('express');
const { db } = require('../database/connection');
const { requireOwner } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireOwner);

// GET /api/admin/logs/audit — audit_log com filtros OR query Lucene-like
//   Filtros simples: ?actor=X&action=Y&target_type=&target_id=&since=&until=
//   Query avancada:  ?q=action:refund* status:>=400
router.get('/audit', (req, res) => {
  let wheres = [];
  const args = [];

  if (req.query.q) {
    const parsed = require('../services/query-parser.service').parse(String(req.query.q));
    wheres.push(...parsed.wheres);
    args.push(...parsed.args);
  }
  if (req.query.actor)       { wheres.push('actor_id = ?');     args.push(String(req.query.actor)); }
  if (req.query.action)      { wheres.push('action LIKE ?');    args.push('%' + req.query.action + '%'); }
  if (req.query.target_type) { wheres.push('target_type = ?');  args.push(String(req.query.target_type)); }
  if (req.query.target_id)   { wheres.push('target_id = ?');    args.push(String(req.query.target_id)); }
  if (req.query.since)       { wheres.push('created_at >= ?');  args.push(parseInt(req.query.since)); }
  if (req.query.until)       { wheres.push('created_at <= ?');  args.push(parseInt(req.query.until)); }
  const limit = Math.min(500, parseInt(req.query.limit) || 100);

  const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT id, actor_id, actor_name, action, target_type, target_id, details, ip, created_at
    FROM audit_log ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...args, limit);
  res.json({ logs: rows, count: rows.length });
});

// GET /api/admin/logs/webhooks — webhook_events com filtros
router.get('/webhooks', (req, res) => {
  const wheres = [];
  const args = [];
  if (req.query.gateway)    { wheres.push('gateway = ?');       args.push(String(req.query.gateway)); }
  if (req.query.status)     { wheres.push('status = ?');        args.push(String(req.query.status)); }
  if (req.query.signature)  { wheres.push('signature_ok = ?');  args.push(parseInt(req.query.signature)); }
  if (req.query.sale_id)    { wheres.push('sale_id = ?');       args.push(parseInt(req.query.sale_id)); }
  if (req.query.since)      { wheres.push('received_at >= ?');  args.push(parseInt(req.query.since)); }
  const limit = Math.min(500, parseInt(req.query.limit) || 100);

  const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT id, gateway, event_id, event_type, transaction_id, sale_id, status,
           signature_ok, error, received_at, processed_at
    FROM webhook_events ${where}
    ORDER BY received_at DESC
    LIMIT ?
  `).all(...args, limit);
  res.json({ webhooks: rows, count: rows.length });
});

// GET /api/admin/logs/rate-limits — violacoes recentes de rate limit
router.get('/rate-limits', (req, res) => {
  const since = parseInt(req.query.since) || (Math.floor(Date.now() / 1000) - 24 * 3600);
  const limit = Math.min(500, parseInt(req.query.limit) || 100);

  let rows = [];
  try {
    rows = db.prepare(`
      SELECT id, key, count, ip, created_at
      FROM rate_limit_violations
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(since, limit);
  } catch {}
  res.json({ violations: rows, count: rows.length });
});

// GET /api/admin/logs/outbound — tentativas de webhooks outbound (todas)
router.get('/outbound', (req, res) => {
  const wheres = [];
  const args = [];
  if (req.query.user_id)    { wheres.push('w.user_id = ?');      args.push(parseInt(req.query.user_id)); }
  if (req.query.event)      { wheres.push('a.event = ?');        args.push(String(req.query.event)); }
  if (req.query.succeeded !== undefined) { wheres.push('a.succeeded = ?'); args.push(parseInt(req.query.succeeded)); }
  if (req.query.since)      { wheres.push('a.created_at >= ?');  args.push(parseInt(req.query.since)); }
  const limit = Math.min(500, parseInt(req.query.limit) || 100);

  const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT a.id, a.webhook_id, w.user_id, w.url, a.event, a.status_code,
           a.error, a.attempt_number, a.succeeded, a.duration_ms, a.created_at
    FROM outbound_webhook_attempts a
    JOIN outbound_webhooks w ON w.id = a.webhook_id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(...args, limit);
  res.json({ attempts: rows, count: rows.length });
});

// Rate limit overrides — gerenciamento sem deploy
const rlMw = require('../middlewares/tenant-rate-limit.middleware');

router.get('/rate-limit/overrides', (req, res) => {
  res.json({ overrides: rlMw.listRouteOverrides() });
});

router.put('/rate-limit/overrides/:route', (req, res) => {
  const route = String(req.params.route);
  const capacity = parseInt(req.body?.capacity);
  const windowMs = parseInt(req.body?.window_ms);
  if (!(capacity > 0) || !(windowMs > 0)) {
    return res.status(400).json({ error: 'capacity e window_ms devem ser > 0' });
  }
  rlMw.setRouteOverride(route, capacity, windowMs, req.appUser?.email || req.appUser?.username || 'admin');
  res.json({ ok: true, route, capacity, window_ms: windowMs });
});

router.delete('/rate-limit/overrides/:route', (req, res) => {
  rlMw.clearRouteOverride(String(req.params.route));
  res.json({ ok: true });
});

// GET /api/admin/logs/summary — counters por categoria nas ultimas 24h
router.get('/summary', (req, res) => {
  const since = Math.floor(Date.now() / 1000) - 24 * 3600;
  const summary = {};
  try { summary.audit_24h    = db.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE created_at >= ?`).get(since).c; } catch {}
  try { summary.webhooks_24h = db.prepare(`SELECT COUNT(*) AS c FROM webhook_events WHERE received_at >= ?`).get(since).c; } catch {}
  try { summary.outbound_24h = db.prepare(`SELECT COUNT(*) AS c FROM outbound_webhook_attempts WHERE created_at >= ?`).get(since).c; } catch {}
  try { summary.outbound_failed_24h = db.prepare(`SELECT COUNT(*) AS c FROM outbound_webhook_attempts WHERE succeeded=0 AND created_at >= ?`).get(since).c; } catch {}
  try { summary.rate_limit_24h = db.prepare(`SELECT COUNT(*) AS c FROM rate_limit_violations WHERE created_at >= ?`).get(since).c; } catch {}
  try { summary.api_key_audit_24h = db.prepare(`SELECT COUNT(*) AS c FROM api_key_audit WHERE created_at >= ?`).get(since).c; } catch {}
  res.json({ since, summary });
});

// Traces (OTLP-style spans)
const tracing = require('../services/tracing.service');

router.get('/traces', (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit) || 100);
  res.json({ spans: tracing.recent(limit).map(tracing.toOTLP) });
});

router.get('/traces/:trace_id', (req, res) => {
  const spans = tracing.findByTraceId(String(req.params.trace_id));
  if (!spans.length) return res.status(404).json({ error: 'trace nao encontrado' });
  res.json({ trace_id: req.params.trace_id, spans: spans.map(tracing.toOTLP) });
});

// System flags (maintenance mode etc)
const flags = require('../services/system-flags.service');

router.get('/flags', (req, res) => {
  res.json({ flags: flags.list() });
});

router.put('/flags/:key', (req, res) => {
  const key = String(req.params.key);
  const value = req.body?.value;
  flags.set(key, value, req.appUser?.email || 'admin');
  res.json({ ok: true, key, value: flags.get(key) });
});

router.delete('/flags/:key', (req, res) => {
  // Setar pra null efetivamente "limpa"
  flags.set(String(req.params.key), null, req.appUser?.email || 'admin');
  res.json({ ok: true });
});

// GET /api/admin/logs/stream — SSE com logs ao vivo (admin)
//   ?level=debug|info|warn|error  (default info)
router.get('/stream', (req, res) => {
  const minLevel = String(req.query.level || 'info');
  require('../services/log-stream.service').attach(req, res, { minLevel });
});

// GET /api/admin/logs/tail — ultimos N logs estruturados (ring buffer)
router.get('/tail', (req, res) => {
  const n = Math.min(500, parseInt(req.query.limit) || 100);
  const level = req.query.level ? String(req.query.level) : null;
  res.json({ logs: require('../services/log-stream.service').recent(n, level) });
});

module.exports = router;
