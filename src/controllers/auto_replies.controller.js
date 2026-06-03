const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireFeature, requireLimit, hasFeature } = require('../config/plans');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireAuth, (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  res.json(db.prepare(`SELECT * FROM auto_replies ${where} ORDER BY active DESC, created_at DESC`).all(...args));
});

router.post('/', requireFeature('autoreply'), (req, res) => {
  const { trigger, match_type, response } = req.body || {};
  if (!trigger || !response) return res.status(400).json({ error: 'trigger e response obrigatorios' });
  const mt = ['contains', 'equals', 'starts_with'].includes(match_type) ? match_type : 'contains';
  const info = db.prepare(`
    INSERT INTO auto_replies (trigger,match_type,response,guild_id) VALUES (?,?,?,?)
  `).run(trigger.trim(), mt, response.trim(), req.guildId || null);
  res.json(db.prepare('SELECT * FROM auto_replies WHERE id=?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const { trigger, match_type, response, active } = req.body || {};
  const existing = db.prepare('SELECT * FROM auto_replies WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'nao encontrado' });
  db.prepare(`
    UPDATE auto_replies SET
      trigger = COALESCE(?, trigger),
      match_type = COALESCE(?, match_type),
      response = COALESCE(?, response),
      active = COALESCE(?, active)
    WHERE id=?
  `).run(
    trigger ?? null,
    match_type ?? null,
    response ?? null,
    active != null ? (active ? 1 : 0) : null,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM auto_replies WHERE id=?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM auto_replies WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
