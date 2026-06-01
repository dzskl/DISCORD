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
  const { name, description, price, role_id, duration, image_url, stock, accent_color } = req.body || {};
  if (!name || price == null) return res.status(400).json({ error: 'nome e preco obrigatorios' });
  const price_cents = Math.round(parseFloat(price) * 100);
  if (!(price_cents > 0)) return res.status(400).json({ error: 'preco invalido' });
  if (image_url && !/^https?:\/\//.test(image_url)) return res.status(400).json({ error: 'image_url deve ser uma URL http(s)' });
  if (accent_color && !/^#[0-9a-fA-F]{6}$/.test(accent_color)) return res.status(400).json({ error: 'accent_color deve ser #RRGGBB' });

  const info = db.prepare(`
    INSERT INTO products (name,description,price_cents,role_id,duration,image_url,stock,accent_color,active)
    VALUES (?,?,?,?,?,?,?,?,1)
  `).run(name.trim(), (description || '').trim(), price_cents, role_id || null, duration || 'permanent', image_url || null,
         stock != null && stock !== '' ? parseInt(stock) : null, accent_color || null);

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, async (req, res) => {
  const { name, description, price, role_id, duration, image_url, stock, accent_color, active } = req.body || {};
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'nao encontrado' });
  if (image_url && !/^https?:\/\//.test(image_url)) return res.status(400).json({ error: 'image_url deve ser uma URL http(s)' });
  if (accent_color && !/^#[0-9a-fA-F]{6}$/.test(accent_color)) return res.status(400).json({ error: 'accent_color deve ser #RRGGBB' });

  const newStock = stock != null && stock !== '' ? parseInt(stock) : null;
  const wasOutOfStock = existing.stock === 0;
  const willHaveStock = newStock != null && newStock > 0;

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price_cents = COALESCE(?, price_cents),
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
    role_id ?? null,
    duration ?? null,
    image_url ?? null,
    stock !== undefined ? newStock : null,
    accent_color ?? null,
    active != null ? (active ? 1 : 0) : null,
    req.params.id
  );

  if (wasOutOfStock && willHaveStock) {
    notifyWishlist(parseInt(req.params.id)).catch(e => require('../logger').warn({ err: e }, 'falha ao notificar wishlist'));
  }

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
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

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
