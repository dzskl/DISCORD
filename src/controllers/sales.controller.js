const express = require('express');
const { db, logEvent } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const bot = require('../services/bot.service');

const router = express.Router();

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

function guildClause(req, alias = 's') {
  if (!req.guildId) return { where: '', args: [] };
  return { where: `AND (${alias}.guild_id = ? OR ${alias}.guild_id IS NULL)`, args: [req.guildId] };
}

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const g = guildClause(req);
  const rows = db.prepare(`
    SELECT s.*, p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE 1=1 ${g.where}
    ORDER BY s.created_at DESC LIMIT ?
  `).all(...g.args, limit);
  res.json(rows);
});

router.get('/summary', requireAuth, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const dayStart = now - 86400;
  const monthStart = now - 86400 * 30;
  const g = guildClause(req);

  const monthRevenue = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales s WHERE status='paid' AND paid_at >= ? ${g.where}`).get(monthStart, ...g.args).v;
  const monthCost = db.prepare(`
    SELECT COALESCE(SUM(p.cost_cents),0) AS v FROM sales s
    JOIN products p ON p.id=s.product_id
    WHERE s.status='paid' AND s.paid_at >= ? ${g.where}
  `).get(monthStart, ...g.args).v;
  const monthProfit = monthRevenue - monthCost;
  const todayCount = db.prepare(`SELECT COUNT(*) AS c FROM sales s WHERE status='paid' AND paid_at >= ? ${g.where}`).get(dayStart, ...g.args).c;
  const allPaid = db.prepare(`SELECT amount_cents FROM sales s WHERE status='paid' ${g.where}`).all(...g.args);
  const avgTicket = allPaid.length ? Math.round(allPaid.reduce((a, b) => a + b.amount_cents, 0) / allPaid.length) : 0;
  const refunds = db.prepare(`SELECT COUNT(*) AS c FROM sales s WHERE status='refunded' ${g.where}`).get(...g.args).c;
  const topProduct = db.prepare(`
    SELECT p.name, COUNT(*) AS c FROM sales s JOIN products p ON p.id=s.product_id
    WHERE s.status='paid' ${g.where} GROUP BY p.id ORDER BY c DESC LIMIT 1
  `).get(...g.args);

  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const start = now - (i + 1) * 30 * 86400;
    const end = now - i * 30 * 86400;
    const v = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales s WHERE status='paid' AND paid_at BETWEEN ? AND ? ${g.where}`).get(start, end, ...g.args).v;
    monthly.push(Math.round(v / 100));
  }

  const byProduct = db.prepare(`
    SELECT p.name, COUNT(*) AS c FROM sales s JOIN products p ON p.id=s.product_id
    WHERE s.status='paid' ${g.where} GROUP BY p.id ORDER BY c DESC LIMIT 4
  `).all(...g.args);

  const byProductWithRevenue = db.prepare(`
    SELECT p.id, p.name, p.cost_cents,
      COUNT(*) AS sales,
      COALESCE(SUM(s.amount_cents),0) AS revenue_cents
    FROM sales s JOIN products p ON p.id=s.product_id
    WHERE s.status='paid' ${g.where} GROUP BY p.id ORDER BY revenue_cents DESC LIMIT 20
  `).all(...g.args);

  res.json({
    month_revenue_cents: monthRevenue,
    month_cost_cents: monthCost,
    month_profit_cents: monthProfit,
    today_count: todayCount,
    avg_ticket_cents: avgTicket,
    refunds,
    top_product: topProduct?.name || '—',
    monthly_revenue: monthly,
    by_product: byProduct,
    products_breakdown: byProductWithRevenue
  });
});

router.post('/:id/refund', requireAuth, async (req, res, next) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'venda nao encontrada' });
  if (sale.status !== 'paid') return res.status(400).json({ error: 'venda nao esta paga' });

  const s = stripe();
  try {
    if (s && sale.stripe_payment_intent) {
      await s.refunds.create({ payment_intent: sale.stripe_payment_intent });
    }
    db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(sale.product_id);
    if (product?.role_id) await bot.revokeRole(sale.discord_id, product.role_id).catch(() => {});
    logEvent({ type: 'reembolso', message: `Reembolso aplicado — ${product?.name || ''}`, discord_id: sale.discord_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/export.csv', requireAuth, (req, res) => {
  const g = guildClause(req);
  const rows = db.prepare(`
    SELECT s.id, s.created_at, s.paid_at, s.discord_id, s.discord_tag, p.name AS product, s.amount_cents, s.status
    FROM sales s LEFT JOIN products p ON p.id=s.product_id
    WHERE 1=1 ${g.where}
    ORDER BY s.created_at DESC
  `).all(...g.args);
  const header = 'id,criada_em,paga_em,discord_id,discord_tag,produto,valor_brl,status\n';
  const body = rows.map(r => [
    r.id,
    new Date(r.created_at * 1000).toISOString(),
    r.paid_at ? new Date(r.paid_at * 1000).toISOString() : '',
    r.discord_id,
    csvEscape(r.discord_tag),
    csvEscape(r.product),
    (r.amount_cents / 100).toFixed(2),
    r.status
  ].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vendas.csv"');
  res.send(header + body);
});

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = router;
