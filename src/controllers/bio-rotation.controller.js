// BIO rotativa do bot — status do Discord rotativo
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  if (!req.guildId) return res.json({ enabled: false, paid: false, statuses: [], interval_seconds: 30 });
  const row = db.prepare('SELECT * FROM bot_bio_rotation WHERE guild_id=?').get(req.guildId);
  if (!row) return res.json({ enabled: false, paid: false, statuses: [], interval_seconds: 30 });
  res.json({
    enabled: !!row.enabled,
    paid: !!row.paid,
    statuses: safeJson(row.statuses_json, []),
    interval_seconds: row.interval_seconds || 30,
    current_index: row.current_index || 0,
    last_rotated_at: row.last_rotated_at
  });
});

router.put('/', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const cur = db.prepare('SELECT paid FROM bot_bio_rotation WHERE guild_id=?').get(req.guildId);
  if (!cur?.paid) return res.status(402).json({ error: 'Recurso pago — desbloqueie por R$5', upgrade_required: true });
  const { enabled, statuses, interval_seconds } = req.body || {};
  const sts = Array.isArray(statuses) ? statuses.slice(0, 20).map(s => String(s).slice(0, 100)) : [];
  const interval = Math.max(10, Math.min(3600, parseInt(interval_seconds) || 30));
  db.prepare(`
    INSERT INTO bot_bio_rotation (guild_id, enabled, statuses_json, interval_seconds)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      statuses_json = excluded.statuses_json,
      interval_seconds = excluded.interval_seconds
  `).run(req.guildId, enabled ? 1 : 0, JSON.stringify(sts), interval);
  res.json({ ok: true });
});

router.post('/purchase', (req, res) => {
  // Placeholder: futuro stripe checkout. Por enquanto marca paid=1.
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  db.prepare(`
    INSERT INTO bot_bio_rotation (guild_id, paid)
    VALUES (?, 1)
    ON CONFLICT(guild_id) DO UPDATE SET paid = 1
  `).run(req.guildId);
  audit.log({ req, action: 'bio_rotation.purchased' });
  res.json({ ok: true });
});

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
