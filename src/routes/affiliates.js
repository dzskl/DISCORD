const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const audit = require('../audit');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM sales WHERE affiliate_id=a.id AND status='paid') AS sales_paid
    FROM affiliates a ORDER BY a.total_commission_cents DESC
  `).all();
  res.json(rows);
});

router.post('/', requireAuth, (req, res) => {
  const { discord_id, discord_tag, code, commission_percent } = req.body || {};
  if (!discord_id || !code) return res.status(400).json({ error: 'discord_id e code obrigatorios' });
  if (!/^\d{16,20}$/.test(String(discord_id))) return res.status(400).json({ error: 'discord_id invalido' });
  const pct = parseInt(commission_percent) || 10;
  if (!(pct > 0 && pct <= 100)) return res.status(400).json({ error: 'comissao deve ser 1-100' });

  try {
    const info = db.prepare(`
      INSERT INTO affiliates (discord_id,discord_tag,code,commission_percent)
      VALUES (?,?,?,?)
    `).run(String(discord_id), discord_tag || null, code.trim().toUpperCase(), pct);
    audit.log({ req, action: 'affiliate.create', target_type: 'affiliate', target_id: info.lastInsertRowid });
    res.json(db.prepare('SELECT * FROM affiliates WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'discord_id ou code ja cadastrado' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const { commission_percent, active } = req.body || {};
  db.prepare(`
    UPDATE affiliates SET
      commission_percent = COALESCE(?,commission_percent),
      active = COALESCE(?,active)
    WHERE id=?
  `).run(
    commission_percent != null ? parseInt(commission_percent) : null,
    active != null ? (active ? 1 : 0) : null,
    req.params.id
  );
  audit.log({ req, action: 'affiliate.update', target_type: 'affiliate', target_id: req.params.id });
  res.json(db.prepare('SELECT * FROM affiliates WHERE id=?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE affiliates SET active=0 WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'affiliate.deactivate', target_type: 'affiliate', target_id: req.params.id });
  res.json({ ok: true });
});

router.get('/lookup/:code', (req, res) => {
  const a = db.prepare('SELECT id, code, commission_percent FROM affiliates WHERE code=? AND active=1').get(req.params.code.trim().toUpperCase());
  if (!a) return res.status(404).json({ error: 'codigo invalido' });
  res.json({ ok: true, code: a.code });
});

router.get('/:id/sales', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, p.name AS product_name FROM sales s LEFT JOIN products p ON p.id=s.product_id
    WHERE s.affiliate_id=? AND s.status='paid' ORDER BY s.paid_at DESC LIMIT 100
  `).all(req.params.id);
  res.json(rows);
});

module.exports = router;
