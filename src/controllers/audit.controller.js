const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const action = req.query.action;
  const parts = [];
  const args = [];
  if (action) { parts.push('action LIKE ?'); args.push(`${action}%`); }
  if (req.guildId) { parts.push('(guild_id = ? OR guild_id IS NULL)'); args.push(req.guildId); }
  const where = parts.length ? 'WHERE ' + parts.join(' AND ') : '';
  args.push(limit);
  const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`).all(...args);
  res.json(rows);
});

router.get('/summary', requireAuth, (req, res) => {
  const dayStart = Math.floor(Date.now() / 1000) - 86400;
  const w = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const a = req.guildId ? [req.guildId] : [];
  const today = db.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE created_at >= ? ${w}`).get(dayStart, ...a).c;
  const byAction = db.prepare(`
    SELECT action, COUNT(*) AS c FROM audit_log WHERE created_at >= ? ${w}
    GROUP BY action ORDER BY c DESC LIMIT 10
  `).all(dayStart, ...a);
  res.json({ today, by_action: byAction });
});

module.exports = router;
