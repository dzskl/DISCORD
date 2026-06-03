const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const where = req.guildId ? 'WHERE (g.guild_id = ? OR g.guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM giveaway_entries WHERE giveaway_id=g.id) AS entries_count
    FROM giveaways g ${where} ORDER BY g.created_at DESC LIMIT 100
  `).all(...args);
  res.json(rows);
});

router.post('/', requireAuth, async (req, res) => {
  const { withinLimit } = require('../config/plans');
  const gFilter = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const gArgs = req.guildId ? [req.guildId] : [];
  const count = db.prepare(`SELECT COUNT(*) AS c FROM giveaways WHERE ended=0 ${gFilter}`).get(...gArgs).c;
  if (!withinLimit('max_giveaways_active', count, req)) {
    return res.status(402).json({ error: 'sorteios são do plano Pro', upgrade_required: true, feature: 'max_giveaways_active' });
  }
  const { channel_name, prize, winners_count, duration_minutes, required_role_id } = req.body || {};
  if (!channel_name || !prize || !duration_minutes) return res.status(400).json({ error: 'channel_name, prize e duration_minutes obrigatorios' });

  const ends_at = Math.floor(Date.now() / 1000) + parseInt(duration_minutes) * 60;
  const bot = require('../services/bot.service');
  try {
    const channelId = await bot.findChannelIdByName(channel_name.replace(/^#/, ''));
    if (!channelId) return res.status(404).json({ error: 'canal nao encontrado' });

    const info = db.prepare(`
      INSERT INTO giveaways (channel_id,prize,winners_count,required_role_id,ends_at,created_by,guild_id)
      VALUES (?,?,?,?,?,?,?)
    `).run(channelId, prize, parseInt(winners_count) || 1, required_role_id || null, ends_at, req.user?.username || 'admin', req.guildId || null);

    const messageId = await bot.postGiveaway(info.lastInsertRowid);
    db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(messageId, info.lastInsertRowid);

    audit.log({ req, action: 'giveaway.create', target_type: 'giveaway', target_id: info.lastInsertRowid, details: { prize, ends_at } });
    res.json(db.prepare('SELECT * FROM giveaways WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/end', requireAuth, async (req, res) => {
  const bot = require('../services/bot.service');
  try {
    await bot.endGiveaway(parseInt(req.params.id), true);
    audit.log({ req, action: 'giveaway.end', target_type: 'giveaway', target_id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM giveaways WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'giveaway.delete', target_type: 'giveaway', target_id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
