const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const action = req.query.action;
  const where = action ? 'WHERE action LIKE ?' : '';
  const args = action ? [`${action}%`, limit] : [limit];
  const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`).all(...args);
  res.json(rows);
});

router.get('/summary', requireAuth, (req, res) => {
  const dayStart = Math.floor(Date.now() / 1000) - 86400;
  const today = db.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE created_at >= ?').get(dayStart).c;
  const byAction = db.prepare(`
    SELECT action, COUNT(*) AS c FROM audit_log WHERE created_at >= ?
    GROUP BY action ORDER BY c DESC LIMIT 10
  `).all(dayStart);
  res.json({ today, by_action: byAction });
});

module.exports = router;
