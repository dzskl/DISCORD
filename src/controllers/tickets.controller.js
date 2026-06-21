const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const status = req.query.status;
  const parts = [];
  const params = [];
  if (status) { parts.push('status=?'); params.push(status); }
  if (req.guildId) { parts.push('(guild_id = ? OR guild_id IS NULL)'); params.push(req.guildId); }
  const where = parts.length ? 'WHERE ' + parts.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM tickets ${where} ORDER BY created_at DESC LIMIT 200`).all(...params);
  res.json(rows);
});

router.get('/_/summary', requireAuth, (req, res) => {
  const w = req.guildId ? `AND (guild_id = ? OR guild_id IS NULL)` : '';
  const a = req.guildId ? [req.guildId] : [];
  const open = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status='open' ${w}`).get(...a).c;
  const closed = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status='closed' ${w}`).get(...a).c;
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
