const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`SELECT * FROM support_panels ${where} ORDER BY created_at DESC`).all(...args);
  res.json(rows.map(r => ({
    ...r,
    schedule_days: r.schedule_days ? safeJson(r.schedule_days, []) : [],
    functions: r.functions_json ? safeJson(r.functions_json, []) : []
  })));
});

router.post('/', (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'nome obrigatorio' });
  const info = db.prepare(`
    INSERT INTO support_panels (guild_id, name, description, embed_color, embed_title)
    VALUES (?,?,?, '#5865F2', ?)
  `).run(req.guildId || null, String(name).slice(0, 100), description || null, name);
  audit.log({ req, action: 'support_panel.create', target_id: info.lastInsertRowid });
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT id FROM support_panels WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'nao encontrado' });
  const b = req.body || {};
  db.prepare(`
    UPDATE support_panels SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      active = COALESCE(?, active),
      schedule_start = COALESCE(?, schedule_start),
      schedule_end = COALESCE(?, schedule_end),
      schedule_days = COALESCE(?, schedule_days),
      embed_color = COALESCE(?, embed_color),
      embed_title = COALESCE(?, embed_title),
      embed_description = COALESCE(?, embed_description),
      embed_footer = COALESCE(?, embed_footer),
      embed_image_url = COALESCE(?, embed_image_url),
      functions_json = COALESCE(?, functions_json)
    WHERE id = ?
  `).run(
    b.name ?? null,
    b.description ?? null,
    b.active != null ? (b.active ? 1 : 0) : null,
    b.schedule_start ?? null,
    b.schedule_end ?? null,
    Array.isArray(b.schedule_days) ? JSON.stringify(b.schedule_days) : null,
    b.embed_color ?? null,
    b.embed_title ?? null,
    b.embed_description ?? null,
    b.embed_footer ?? null,
    b.embed_image_url ?? null,
    Array.isArray(b.functions) ? JSON.stringify(b.functions) : null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM support_panels WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'support_panel.delete', target_id: req.params.id });
  res.json({ ok: true });
});

router.post('/:id/post', (req, res) => {
  // Marca como postado (envio real ao Discord precisa do bot.service — futuro)
  const { channel_id, message_id } = req.body || {};
  db.prepare('UPDATE support_panels SET posted_channel_id=?, posted_message_id=? WHERE id=?')
    .run(channel_id || null, message_id || null, req.params.id);
  res.json({ ok: true });
});

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
