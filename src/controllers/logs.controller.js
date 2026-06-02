const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const type = req.query.type;
  const where = type ? 'WHERE type = ?' : '';
  const args = type ? [type, limit] : [limit];
  const rows = db.prepare(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ?`).all(...args);
  res.json(rows);
});

router.get('/summary', requireAuth, (req, res) => {
  const dayStart = Math.floor(Date.now() / 1000) - 86400;
  const today = db.prepare('SELECT COUNT(*) AS c FROM logs WHERE created_at >= ?').get(dayStart).c;
  const errors = db.prepare(`SELECT COUNT(*) AS c FROM logs WHERE type='erro' AND created_at >= ?`).get(dayStart).c;
  const cmds = db.prepare(`SELECT COUNT(*) AS c FROM command_usage WHERE created_at >= ?`).get(dayStart).c;
  const joins = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE created_at >= ?`).get(dayStart).c;
  res.json({ today, errors, commands: cmds, joins_leaves: joins });
});

module.exports = router;
