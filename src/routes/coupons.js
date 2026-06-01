const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM coupons ORDER BY active DESC, created_at DESC').all());
});

router.post('/', requireAuth, (req, res) => {
  const { code, discount_percent, max_uses, expires_at, min_amount } = req.body || {};
  if (!code || !discount_percent) return res.status(400).json({ error: 'code e discount_percent obrigatorios' });
  const pct = parseInt(discount_percent);
  if (!(pct > 0 && pct <= 100)) return res.status(400).json({ error: 'desconto deve ser 1-100' });
  const min_cents = min_amount ? Math.round(parseFloat(min_amount) * 100) : null;

  try {
    const info = db.prepare(`
      INSERT INTO coupons (code,discount_percent,max_uses,expires_at,min_amount_cents)
      VALUES (?,?,?,?,?)
    `).run(code.trim().toUpperCase(), pct, max_uses ? parseInt(max_uses) : null, expires_at || null, min_cents);
    res.json(db.prepare('SELECT * FROM coupons WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'codigo ja existe' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE coupons SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/validate', (req, res) => {
  const { code, cart_total_cents } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code obrigatorio' });
  const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(code.trim().toUpperCase());
  if (!c) return res.status(404).json({ error: 'cupom invalido' });
  if (c.expires_at && c.expires_at < Math.floor(Date.now() / 1000)) return res.status(410).json({ error: 'cupom expirado' });
  if (c.max_uses != null && c.uses >= c.max_uses) return res.status(410).json({ error: 'cupom esgotado' });
  if (c.min_amount_cents && cart_total_cents != null && cart_total_cents < c.min_amount_cents) {
    return res.status(400).json({ error: `valor minimo de R$ ${(c.min_amount_cents / 100).toFixed(2).replace('.', ',')}` });
  }
  res.json({ ok: true, discount_percent: c.discount_percent, code: c.code, min_amount_cents: c.min_amount_cents });
});

module.exports = router;
