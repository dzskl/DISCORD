const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const bot = require('../services/bot.service');

const router = express.Router();

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const guildStats = await bot.getStats().catch(() => ({ total: 0, online: 0 }));

    const dayStart = Math.floor(Date.now() / 1000) - 86400;
    const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;
    const monthStart = Math.floor(Date.now() / 1000) - 30 * 86400;

    const commandsToday = db.prepare(`SELECT COUNT(*) AS c FROM command_usage WHERE created_at >= ?`).get(dayStart).c;
    const modToday = db.prepare(`SELECT COUNT(*) AS c FROM mod_actions WHERE created_at >= ?`).get(dayStart).c;
    const joinsWeek = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at >= ?`).get(weekStart).c;
    const monthRevenue = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(monthStart).v;

    const topCommands = db.prepare(`
      SELECT command, COUNT(*) AS c FROM command_usage WHERE created_at >= ?
      GROUP BY command ORDER BY c DESC LIMIT 5
    `).all(weekStart);

    const recentLogs = db.prepare(`SELECT * FROM logs ORDER BY created_at DESC LIMIT 6`).all();

    const modCounts = db.prepare(`
      SELECT action, COUNT(*) AS c FROM mod_actions WHERE created_at >= ? GROUP BY action
    `).all(monthStart);
    const modMap = Object.fromEntries(modCounts.map(r => [r.action, r.c]));

    const memberActivity = [];
    for (let i = 13; i >= 0; i--) {
      const start = Math.floor(Date.now() / 1000) - (i + 1) * 86400;
      const end = Math.floor(Date.now() / 1000) - i * 86400;
      memberActivity.push({
        joins: db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at BETWEEN ? AND ?`).get(start, end).c,
        leaves: db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='leave' AND created_at BETWEEN ? AND ?`).get(start, end).c
      });
    }

    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const start = Math.floor(Date.now() / 1000) - (i + 1) * 30 * 86400;
      const end = Math.floor(Date.now() / 1000) - i * 30 * 86400;
      const v = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at BETWEEN ? AND ?`).get(start, end).v;
      monthlyRevenue.push(Math.round(v / 100));
    }

    res.json({
      members_total: guildStats.total,
      members_online: guildStats.online,
      joins_week: joinsWeek,
      commands_today: commandsToday,
      mod_today: modToday,
      month_revenue_cents: monthRevenue,
      top_commands: topCommands,
      recent_logs: recentLogs,
      mod_counts: { ban: modMap.ban || 0, kick: modMap.kick || 0, mute: modMap.mute || 0, warn: modMap.warn || 0 },
      member_activity_14d: memberActivity,
      monthly_revenue_6m: monthlyRevenue
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
