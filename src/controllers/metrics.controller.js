// /metrics — formato Prometheus exposition. Protegido por token compartilhado
// (METRICS_BEARER_TOKEN) ou IP allowlist (METRICS_ALLOWED_IPS, csv).
//
// Padrao: localhost permitido sem token (uso comum em scraping local).

const express = require('express');
const metrics = require('../services/metrics.service');

const router = express.Router();

function isLocal(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function authorized(req) {
  if (isLocal(req)) return true;
  const token = process.env.METRICS_BEARER_TOKEN;
  if (token) {
    const auth = String(req.headers.authorization || '');
    if (auth === `Bearer ${token}`) return true;
  }
  const allowed = String(process.env.METRICS_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length && allowed.includes(req.ip)) return true;
  return false;
}

router.get('/', (req, res) => {
  if (!authorized(req)) return res.status(401).send('unauthorized');
  metrics.refreshGauges();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.render());
});

module.exports = router;
