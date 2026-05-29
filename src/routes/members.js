const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const bot = require('../bot');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const list = await bot.listMembers(parseInt(req.query.limit) || 100);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const stats = await bot.getStats();
    const dayStart = Math.floor(Date.now() / 1000) - 86400;
    const joins = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at >= ?`).get(dayStart).c;
    const leaves = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='leave' AND created_at >= ?`).get(dayStart).c;

    const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;
    const weekJoins = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at >= ?`).get(weekStart).c;

    const growth = [];
    for (let i = 13; i >= 0; i--) {
      const start = Math.floor(Date.now() / 1000) - (i + 1) * 86400;
      const end = Math.floor(Date.now() / 1000) - i * 86400;
      const dayJoins = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at BETWEEN ? AND ?`).get(start, end).c;
      const dayLeaves = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='leave' AND created_at BETWEEN ? AND ?`).get(start, end).c;
      growth.push({ joins: dayJoins, leaves: dayLeaves });
    }

    res.json({
      total: stats.total,
      online: stats.online,
      joins_today: joins,
      leaves_today: leaves,
      joins_week: weekJoins,
      growth_14d: growth
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
