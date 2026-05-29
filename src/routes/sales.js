const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const rows = db.prepare(`
    SELECT s.*, p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    ORDER BY s.created_at DESC LIMIT ?
  `).all(limit);
  res.json(rows);
});

router.get('/summary', requireAuth, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const dayStart = now - 86400;
  const monthStart = now - 86400 * 30;

  const monthRevenue = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(monthStart).v;
  const todayCount = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status='paid' AND paid_at >= ?`).get(dayStart).c;
  const allPaid = db.prepare(`SELECT amount_cents FROM sales WHERE status='paid'`).all();
  const avgTicket = allPaid.length ? Math.round(allPaid.reduce((a, b) => a + b.amount_cents, 0) / allPaid.length) : 0;
  const refunds = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status='refunded'`).get().c;
  const topProduct = db.prepare(`
    SELECT p.name, COUNT(*) AS c FROM sales s JOIN products p ON p.id=s.product_id
    WHERE s.status='paid' GROUP BY p.id ORDER BY c DESC LIMIT 1
  `).get();

  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const start = now - (i + 1) * 30 * 86400;
    const end = now - i * 30 * 86400;
    const v = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at BETWEEN ? AND ?`).get(start, end).v;
    monthly.push(Math.round(v / 100));
  }

  const byProduct = db.prepare(`
    SELECT p.name, COUNT(*) AS c FROM sales s JOIN products p ON p.id=s.product_id
    WHERE s.status='paid' GROUP BY p.id ORDER BY c DESC LIMIT 4
  `).all();

  res.json({
    month_revenue_cents: monthRevenue,
    today_count: todayCount,
    avg_ticket_cents: avgTicket,
    refunds,
    top_product: topProduct?.name || '—',
    monthly_revenue: monthly,
    by_product: byProduct
  });
});

router.post('/:id/refund', requireAuth, (req, res) => {
  db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
