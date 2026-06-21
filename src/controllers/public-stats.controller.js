// Endpoints publicos (sem auth) pra alimentar a landing.
// Cache em memoria de 30s pra nao queimar SQLite com refresh agressivo.

const express = require('express');
const { db } = require('../database/connection');

const router = express.Router();

let _cache = { at: 0, data: null };
const TTL = 30 * 1000;

router.get('/global', (req, res) => {
  if (_cache.data && Date.now() - _cache.at < TTL) return res.json(_cache.data);

  // Bases reais + boost de marketing pra ficar bonito quando ainda eh pequeno
  const guildsActive = db.prepare(`SELECT COUNT(*) AS c FROM guilds WHERE active=1`).get().c;
  const txCount = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status IN ('paid','refunded')`).get().c;
  const volume = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid'`).get().v;
  const membersReached = db.prepare(`SELECT COUNT(DISTINCT discord_id) AS c FROM sales`).get().c;

  // Boosts (visiveis enquanto a base e pequena — substituir por 0 quando real ultrapassar)
  const data = {
    servers_active: Math.max(guildsActive, 0),
    transactions: Math.max(txCount, 0),
    members_reached: Math.max(membersReached, 0),
    volume_cents: Math.max(volume, 0)
  };
  _cache = { at: Date.now(), data };
  res.json(data);
});

// Ultimas vendas pra animacao na landing (mascara identidade)
router.get('/recent-sales', (req, res) => {
  const rows = db.prepare(`
    SELECT s.amount_cents, s.paid_at, s.discord_tag, p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.status='paid' AND s.paid_at IS NOT NULL
    ORDER BY s.paid_at DESC LIMIT 8
  `).all();
  res.json(rows.map(r => ({
    product_name: r.product_name || 'Produto',
    amount_cents: r.amount_cents,
    paid_at: r.paid_at,
    customer_initial: r.discord_tag ? r.discord_tag.charAt(0).toUpperCase() : '?',
    customer_masked: r.discord_tag ? r.discord_tag.charAt(0).toUpperCase() + '. ' + (r.discord_tag.split(/[#_]/)[1] || '').charAt(0).toUpperCase() : '—'
  })));
});

// Configuracao publica (GA tracking ID etc)
router.get('/config', (req, res) => {
  const { getConfig } = require('../database/connection');
  const cfg = getConfig();
  res.json({
    ga_measurement_id: cfg.ga_measurement_id || ''
  });
});

module.exports = router;
