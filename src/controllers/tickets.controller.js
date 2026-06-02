const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const status = req.query.status;
  const where = status ? `WHERE status=?` : '';
  const params = status ? [status] : [];
  const rows = db.prepare(`SELECT * FROM tickets ${where} ORDER BY created_at DESC LIMIT 200`).all(...params);
  res.json(rows);
});

router.get('/_/summary', requireAuth, (req, res) => {
  const open = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status='open'`).get().c;
  const closed = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status='closed'`).get().c;
  res.json({ open, closed });
});

router.post('/:id/close', requireAuth, async (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'nao encontrado' });
  db.prepare(`UPDATE tickets SET status='closed', closed_at=strftime('%s','now') WHERE id=?`).run(req.params.id);
  if (t.channel_id) {
    const bot = require('../services/bot.service');
    bot.closeTicketChannel?.(t.channel_id).catch(() => {});
  }
  res.json({ ok: true });
});

module.exports = router;
