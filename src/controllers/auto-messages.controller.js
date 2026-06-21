// Mensagens automaticas — broadcasts agendados por intervalo
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const q = String(req.query.q || '').trim();
  const rows = db.prepare(`SELECT * FROM auto_messages ${where} ORDER BY created_at DESC`).all(...args);
  const list = rows.map(r => ({ ...r, embed: safeJson(r.embed_json, null) }));
  const filtered = q ? list.filter(m => (m.channel_id || '').includes(q) || (m.content || '').toLowerCase().includes(q.toLowerCase())) : list;
  res.json(filtered);
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.channel_id) return res.status(400).json({ error: 'channel_id obrigatorio' });
  const mode = ['embed', 'components_v2', 'legacy'].includes(b.mode) ? b.mode : 'embed';
  const interval = Math.max(1, parseInt(b.interval_minutes) || 60);
  const info = db.prepare(`
    INSERT INTO auto_messages (guild_id, channel_id, content, mode, interval_minutes, embed_json, enabled)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    req.guildId || null,
    String(b.channel_id),
    b.content || null,
    mode,
    interval,
    b.embed ? JSON.stringify(b.embed) : null,
    b.enabled === false ? 0 : 1
  );
  audit.log({ req, action: 'auto_message.create', target_id: info.lastInsertRowid });
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT id FROM auto_messages WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'nao encontrado' });
  const b = req.body || {};
  const mode = b.mode && ['embed', 'components_v2', 'legacy'].includes(b.mode) ? b.mode : null;
  const interval = b.interval_minutes != null ? Math.max(1, parseInt(b.interval_minutes) || 60) : null;
  db.prepare(`
    UPDATE auto_messages SET
      channel_id = COALESCE(?, channel_id),
      content = COALESCE(?, content),
      mode = COALESCE(?, mode),
      interval_minutes = COALESCE(?, interval_minutes),
      embed_json = COALESCE(?, embed_json),
      enabled = COALESCE(?, enabled)
    WHERE id = ?
  `).run(
    b.channel_id ?? null,
    b.content ?? null,
    mode,
    interval,
    b.embed ? JSON.stringify(b.embed) : null,
    b.enabled != null ? (b.enabled ? 1 : 0) : null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM auto_messages WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'auto_message.delete', target_id: req.params.id });
  res.json({ ok: true });
});

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
