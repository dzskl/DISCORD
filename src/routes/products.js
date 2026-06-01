const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM sales s WHERE s.product_id=p.id AND s.status='paid') AS sales_count
    FROM products p
    ORDER BY p.active DESC, p.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', requireAuth, (req, res) => {
  const { name, description, price, cost, role_id, duration, image_url, stock, accent_color } = req.body || {};
  if (!name || price == null) return res.status(400).json({ error: 'nome e preco obrigatorios' });
  const price_cents = Math.round(parseFloat(price) * 100);
  const cost_cents = cost != null && cost !== '' ? Math.round(parseFloat(cost) * 100) : null;
  if (!(price_cents > 0)) return res.status(400).json({ error: 'preco invalido' });
  if (image_url && !/^https?:\/\//.test(image_url)) return res.status(400).json({ error: 'image_url deve ser uma URL http(s)' });
  if (accent_color && !/^#[0-9a-fA-F]{6}$/.test(accent_color)) return res.status(400).json({ error: 'accent_color deve ser #RRGGBB' });

  const initialStock = stock != null && stock !== '' ? parseInt(stock) : null;
  const info = db.prepare(`
    INSERT INTO products (name,description,price_cents,cost_cents,role_id,duration,image_url,stock,accent_color,active)
    VALUES (?,?,?,?,?,?,?,?,?,1)
  `).run(name.trim(), (description || '').trim(), price_cents, cost_cents, role_id || null, duration || 'permanent', image_url || null,
         initialStock, accent_color || null);

  if (initialStock != null && initialStock > 0) {
    db.prepare('INSERT INTO stock_log (product_id,delta,before_qty,after_qty,reason,actor) VALUES (?,?,?,?,?,?)')
      .run(info.lastInsertRowid, initialStock, 0, initialStock, 'estoque inicial', req.user?.username || 'admin');
  }

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, async (req, res) => {
  const { name, description, price, cost, role_id, duration, image_url, stock, accent_color, active, stock_reason } = req.body || {};
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'nao encontrado' });
  if (image_url && !/^https?:\/\//.test(image_url)) return res.status(400).json({ error: 'image_url deve ser uma URL http(s)' });
  if (accent_color && !/^#[0-9a-fA-F]{6}$/.test(accent_color)) return res.status(400).json({ error: 'accent_color deve ser #RRGGBB' });

  const newStock = stock != null && stock !== '' ? parseInt(stock) : (stock === null ? null : undefined);
  const stockChanged = newStock !== undefined && newStock !== existing.stock;
  const wasOutOfStock = existing.stock === 0;
  const willHaveStock = newStock != null && newStock > 0;

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price_cents = COALESCE(?, price_cents),
      cost_cents = COALESCE(?, cost_cents),
      role_id = COALESCE(?, role_id),
      duration = COALESCE(?, duration),
      image_url = COALESCE(?, image_url),
      stock = COALESCE(?, stock),
      accent_color = COALESCE(?, accent_color),
      active = COALESCE(?, active)
    WHERE id=?
  `).run(
    name ?? null,
    description ?? null,
    price != null ? Math.round(parseFloat(price) * 100) : null,
    cost != null && cost !== '' ? Math.round(parseFloat(cost) * 100) : null,
    role_id ?? null,
    duration ?? null,
    image_url ?? null,
    stock !== undefined ? newStock : null,
    accent_color ?? null,
    active != null ? (active ? 1 : 0) : null,
    req.params.id
  );

  if (stockChanged) {
    const delta = (newStock ?? 0) - (existing.stock ?? 0);
    db.prepare('INSERT INTO stock_log (product_id,delta,before_qty,after_qty,reason,actor) VALUES (?,?,?,?,?,?)')
      .run(req.params.id, delta, existing.stock, newStock, stock_reason || 'ajuste manual', req.user?.username || 'admin');
  }

  if (wasOutOfStock && willHaveStock) {
    notifyWishlist(parseInt(req.params.id)).catch(e => require('../logger').warn({ err: e }, 'falha ao notificar wishlist'));
    announceRestock(parseInt(req.params.id), newStock).catch(e => require('../logger').warn({ err: e }, 'falha ao anunciar restock'));
  }

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
});

router.get('/:id/stock-log', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM stock_log WHERE product_id=? ORDER BY created_at DESC LIMIT 100`).all(req.params.id);
  res.json(rows);
});

router.get('/:id/stats', requireAuth, (req, res) => {
  const id = req.params.id;
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) return res.status(404).json({ error: 'nao encontrado' });

  const totals = db.prepare(`
    SELECT COUNT(*) AS sales,
           COALESCE(SUM(amount_cents),0) AS revenue_cents
    FROM sales WHERE product_id=? AND status='paid'
  `).get(id);
  const refunds = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE product_id=? AND status='refunded'`).get(id).c;
  const cost_cents = (p.cost_cents || 0) * totals.sales;
  const profit_cents = totals.revenue_cents - cost_cents;

  const now = Math.floor(Date.now() / 1000);
  const series = [];
  for (let i = 5; i >= 0; i--) {
    const start = now - (i + 1) * 30 * 86400;
    const end = now - i * 30 * 86400;
    const m = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE product_id=? AND status='paid' AND paid_at BETWEEN ? AND ?`).get(id, start, end);
    series.push({ sales: m.c, revenue_cents: m.v });
  }

  res.json({ product: p, totals: { ...totals, refunds, cost_cents, profit_cents }, monthly: series });
});

async function notifyWishlist(productId) {
  const bot = require('../bot');
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
  if (!product) return;
  const subs = db.prepare(`SELECT * FROM wishlist WHERE product_id=? AND notified=0`).all(productId);
  for (const s of subs) {
    const sent = await bot.dmUser(s.discord_id, `📦 **${product.name}** voltou ao estoque!\n\nCorra na loja: ${process.env.PUBLIC_URL || ''}/loja.html`);
    if (sent) db.prepare('UPDATE wishlist SET notified=1 WHERE id=?').run(s.id);
  }
}

async function announceRestock(productId, stock) {
  const bot = require('../bot');
  const { getConfig } = require('../db');
  const cfg = getConfig();
  if (cfg.restock_announce !== '1') return;
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
  if (!product) return;
  await bot.announceRestock?.(product, stock).catch(() => {});
}

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
