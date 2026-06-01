const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const audit = require('../audit');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(p.id) AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.active=1
    GROUP BY c.id ORDER BY c.display_order, c.name
  `).all();
  res.json(rows);
});

router.post('/', requireAuth, (req, res) => {
  const { name, description, icon, display_order } = req.body || {};
  if (!name) return res.status(400).json({ error: 'nome obrigatorio' });
  try {
    const info = db.prepare(`
      INSERT INTO categories (name,description,icon,display_order) VALUES (?,?,?,?)
    `).run(name.trim(), (description || '').trim(), icon || null, parseInt(display_order) || 0);
    const row = db.prepare('SELECT * FROM categories WHERE id=?').get(info.lastInsertRowid);
    audit.log({ req, action: 'category.create', target_type: 'category', target_id: row.id, details: { name } });
    res.json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'categoria ja existe' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const { name, description, icon, display_order } = req.body || {};
  db.prepare(`
    UPDATE categories SET
      name = COALESCE(?,name),
      description = COALESCE(?,description),
      icon = COALESCE(?,icon),
      display_order = COALESCE(?,display_order)
    WHERE id=?
  `).run(name ?? null, description ?? null, icon ?? null, display_order != null ? parseInt(display_order) : null, req.params.id);
  audit.log({ req, action: 'category.update', target_type: 'category', target_id: req.params.id, details: req.body });
  res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE products SET category_id=NULL WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'category.delete', target_type: 'category', target_id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
