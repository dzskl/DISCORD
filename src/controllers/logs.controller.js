const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

function gFilter(req) {
  if (!req.guildId) return { where: '', args: [] };
  return { where: '(guild_id = ? OR guild_id IS NULL)', args: [req.guildId] };
}

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const type = req.query.type;
  const g = gFilter(req);
  const parts = [];
  const args = [];
  if (type) { parts.push('type = ?'); args.push(type); }
  if (g.where) { parts.push(g.where); args.push(...g.args); }
  const where = parts.length ? 'WHERE ' + parts.join(' AND ') : '';
  args.push(limit);
  const rows = db.prepare(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ?`).all(...args);
  res.json(rows);
});

router.get('/summary', requireAuth, (req, res) => {
  const dayStart = Math.floor(Date.now() / 1000) - 86400;
  const g = gFilter(req);
  const w = g.where ? `AND ${g.where}` : '';
  const today = db.prepare(`SELECT COUNT(*) AS c FROM logs WHERE created_at >= ? ${w}`).get(dayStart, ...g.args).c;
  const errors = db.prepare(`SELECT COUNT(*) AS c FROM logs WHERE type='erro' AND created_at >= ? ${w}`).get(dayStart, ...g.args).c;
  const cmds = db.prepare(`SELECT COUNT(*) AS c FROM command_usage WHERE created_at >= ? ${w}`).get(dayStart, ...g.args).c;
  const joins = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE created_at >= ? ${w}`).get(dayStart, ...g.args).c;
  res.json({ today, errors, commands: cmds, joins_leaves: joins });
});

module.exports = router;
