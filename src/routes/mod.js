const express = require('express');
const { db, logEvent } = require('../db');
const { requireAuth } = require('../middleware/auth');
const bot = require('../bot');

const router = express.Router();

router.get('/actions', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  res.json(db.prepare('SELECT * FROM mod_actions ORDER BY created_at DESC LIMIT ?').all(limit));
});

router.get('/summary', requireAuth, (req, res) => {
  const counts = db.prepare(`SELECT action, COUNT(*) AS c FROM mod_actions GROUP BY action`).all();
  const map = Object.fromEntries(counts.map(r => [r.action, r.c]));

  const months = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 5; i >= 0; i--) {
    const start = now - (i + 1) * 30 * 86400;
    const end = now - i * 30 * 86400;
    const bans = db.prepare(`SELECT COUNT(*) AS c FROM mod_actions WHERE action='ban' AND created_at BETWEEN ? AND ?`).get(start, end).c;
    const kicks = db.prepare(`SELECT COUNT(*) AS c FROM mod_actions WHERE action='kick' AND created_at BETWEEN ? AND ?`).get(start, end).c;
    const mutes = db.prepare(`SELECT COUNT(*) AS c FROM mod_actions WHERE action='mute' AND created_at BETWEEN ? AND ?`).get(start, end).c;
    months.push({ bans, kicks, mutes });
  }
  res.json({
    counts: { ban: map.ban || 0, kick: map.kick || 0, mute: map.mute || 0, warn: map.warn || 0, automod: map.automod || 0 },
    monthly: months
  });
});

router.post('/ban', requireAuth, async (req, res) => {
  const { userId, reason } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
  try {
    await bot.banMember(userId, reason || 'Sem motivo');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/kick', requireAuth, async (req, res) => {
  const { userId, reason } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
  try {
    await bot.kickMember(userId, reason || 'Sem motivo');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/timeout', requireAuth, async (req, res) => {
  const { userId, minutes, reason } = req.body || {};
  if (!userId || !minutes) return res.status(400).json({ error: 'userId e minutes obrigatorios' });
  try {
    await bot.timeoutMember(userId, parseInt(minutes), reason || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/warn', requireAuth, (req, res) => {
  const { userId, userTag, reason, moderatorId, moderatorTag } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
  db.prepare('INSERT INTO mod_actions (action,target_id,target_tag,moderator_id,moderator_tag,reason) VALUES (?,?,?,?,?,?)')
    .run('warn', userId, userTag || null, moderatorId || null, moderatorTag || null, reason || '');
  logEvent({ type: 'warn', message: `${userTag || userId} avisado${reason ? ' — ' + reason : ''}`, discord_id: userId, discord_tag: userTag });
  res.json({ ok: true });
});

module.exports = router;
