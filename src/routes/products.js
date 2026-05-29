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
  const { name, description, price, role_id, duration } = req.body || {};
  if (!name || price == null) return res.status(400).json({ error: 'nome e preco obrigatorios' });
  const price_cents = Math.round(parseFloat(price) * 100);
  if (!(price_cents > 0)) return res.status(400).json({ error: 'preco invalido' });

  const info = db.prepare(`
    INSERT INTO products (name,description,price_cents,role_id,duration,active)
    VALUES (?,?,?,?,?,1)
  `).run(name.trim(), (description || '').trim(), price_cents, role_id || null, duration || 'permanent');

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const { name, description, price, role_id, duration, active } = req.body || {};
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'nao encontrado' });

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price_cents = COALESCE(?, price_cents),
      role_id = COALESCE(?, role_id),
      duration = COALESCE(?, duration),
      active = COALESCE(?, active)
    WHERE id=?
  `).run(
    name ?? null,
    description ?? null,
    price != null ? Math.round(parseFloat(price) * 100) : null,
    role_id ?? null,
    duration ?? null,
    active != null ? (active ? 1 : 0) : null,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
