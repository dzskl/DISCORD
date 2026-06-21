const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', (req, res) => {
  const { discord_id, product_id } = req.body || {};
  if (!discord_id || !product_id) return res.status(400).json({ error: 'discord_id e product_id obrigatorios' });
  if (!/^\d{16,20}$/.test(String(discord_id))) return res.status(400).json({ error: 'discord_id invalido' });
  const product = db.prepare('SELECT id FROM products WHERE id=? AND active=1').get(product_id);
  if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
  try {
    db.prepare('INSERT OR IGNORE INTO wishlist (discord_id,product_id) VALUES (?,?)').run(String(discord_id), product_id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, p.name AS product_name
    FROM wishlist w JOIN products p ON p.id=w.product_id
    WHERE w.notified=0 ORDER BY w.created_at DESC
  `).all();
  res.json(rows);
});

module.exports = router;
