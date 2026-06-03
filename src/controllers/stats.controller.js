const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const bot = require('../services/bot.service');

const router = express.Router();

function gClause(req, col = 'guild_id') {
  if (!req.guildId) return { where: '', args: [] };
  return { where: `AND (${col} = ? OR ${col} IS NULL)`, args: [req.guildId] };
}

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const guildStats = await bot.getStats(req.guildId).catch(() => ({ total: 0, online: 0 }));

    const dayStart = Math.floor(Date.now() / 1000) - 86400;
    const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;
    const monthStart = Math.floor(Date.now() / 1000) - 30 * 86400;
    const g = gClause(req);

    const commandsToday = db.prepare(`SELECT COUNT(*) AS c FROM command_usage WHERE created_at >= ? ${g.where}`).get(dayStart, ...g.args).c;
    const modToday = db.prepare(`SELECT COUNT(*) AS c FROM mod_actions WHERE created_at >= ? ${g.where}`).get(dayStart, ...g.args).c;
    const joinsWeek = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at >= ? ${g.where}`).get(weekStart, ...g.args).c;
    const monthRevenue = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ? ${g.where}`).get(monthStart, ...g.args).v;

    const topCommands = db.prepare(`
      SELECT command, COUNT(*) AS c FROM command_usage WHERE created_at >= ? ${g.where}
      GROUP BY command ORDER BY c DESC LIMIT 5
    `).all(weekStart, ...g.args);

    const recentLogs = db.prepare(`SELECT * FROM logs WHERE 1=1 ${g.where} ORDER BY created_at DESC LIMIT 6`).all(...g.args);

    const modCounts = db.prepare(`
      SELECT action, COUNT(*) AS c FROM mod_actions WHERE created_at >= ? ${g.where} GROUP BY action
    `).all(monthStart, ...g.args);
    const modMap = Object.fromEntries(modCounts.map(r => [r.action, r.c]));

    const memberActivity = [];
    for (let i = 13; i >= 0; i--) {
      const start = Math.floor(Date.now() / 1000) - (i + 1) * 86400;
      const end = Math.floor(Date.now() / 1000) - i * 86400;
      memberActivity.push({
        joins: db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at BETWEEN ? AND ? ${g.where}`).get(start, end, ...g.args).c,
        leaves: db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='leave' AND created_at BETWEEN ? AND ? ${g.where}`).get(start, end, ...g.args).c
      });
    }

    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const start = Math.floor(Date.now() / 1000) - (i + 1) * 30 * 86400;
      const end = Math.floor(Date.now() / 1000) - i * 30 * 86400;
      const v = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at BETWEEN ? AND ? ${g.where}`).get(start, end, ...g.args).v;
      monthlyRevenue.push(Math.round(v / 100));
    }

    res.json({
      server_name: guildStats.name || null,
      server_icon: guildStats.icon || null,
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
