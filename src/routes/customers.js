const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = db.prepare(`
    SELECT
      discord_id,
      MAX(discord_tag) AS discord_tag,
      COUNT(*) AS purchases,
      SUM(CASE WHEN status='paid' THEN amount_cents ELSE 0 END) AS total_cents,
      MAX(paid_at) AS last_purchase_at,
      SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_count,
      SUM(CASE WHEN status='refunded' THEN 1 ELSE 0 END) AS refunded_count
    FROM sales
    WHERE discord_id IS NOT NULL
    GROUP BY discord_id
    ORDER BY total_cents DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

router.get('/:discord_id', requireAuth, (req, res) => {
  const purchases = db.prepare(`
    SELECT s.*, p.name AS product_name FROM sales s
    LEFT JOIN products p ON p.id = s.product_id
    WHERE s.discord_id = ?
    ORDER BY s.created_at DESC
  `).all(req.params.discord_id);
  res.json(purchases);
});

router.get('/_/summary', requireAuth, (req, res) => {
  const total = db.prepare(`SELECT COUNT(DISTINCT discord_id) AS c FROM sales WHERE status='paid'`).get().c;
  const dayStart = Math.floor(Date.now() / 1000) - 86400;
  const newToday = db.prepare(`
    SELECT COUNT(DISTINCT discord_id) AS c FROM sales s1
    WHERE status='paid' AND paid_at >= ?
    AND NOT EXISTS (SELECT 1 FROM sales s2 WHERE s2.discord_id=s1.discord_id AND s2.status='paid' AND s2.paid_at < ?)
  `).get(dayStart, dayStart).c;
  const allPaid = db.prepare(`
    SELECT discord_id, SUM(amount_cents) AS total FROM sales WHERE status='paid' GROUP BY discord_id
  `).all();
  const ltv = allPaid.length ? Math.round(allPaid.reduce((a, b) => a + b.total, 0) / allPaid.length) : 0;
  res.json({ total_customers: total, new_today: newToday, avg_ltv_cents: ltv });
});

router.get('/_/export.csv', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT discord_id, MAX(discord_tag) AS discord_tag, COUNT(*) AS compras,
      SUM(CASE WHEN status='paid' THEN amount_cents ELSE 0 END) AS total_cents,
      MAX(paid_at) AS last_purchase_at
    FROM sales WHERE discord_id IS NOT NULL GROUP BY discord_id ORDER BY total_cents DESC
  `).all();
  const header = 'discord_id,discord_tag,compras,total_brl,ultima_compra\n';
  const body = rows.map(r => [
    r.discord_id,
    csvEscape(r.discord_tag),
    r.compras,
    (r.total_cents / 100).toFixed(2),
    r.last_purchase_at ? new Date(r.last_purchase_at * 1000).toISOString() : ''
  ].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
  res.send(header + body);
});

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = router;
