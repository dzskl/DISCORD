// Acoes Automaticas — Reacoes, Repostagem, Limpeza, Sugestoes
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

function getCfg(guildId, key, fb = null) {
  if (!guildId) return fb;
  const row = db.prepare('SELECT value FROM guild_config WHERE guild_id=? AND key=?').get(guildId, key);
  if (!row) return fb;
  try { return JSON.parse(row.value); } catch { return fb; }
}
function setCfg(guildId, key, value) {
  if (!guildId) return;
  db.prepare(`
    INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value=excluded.value
  `).run(guildId, key, JSON.stringify(value));
}

// =================== REACOES AUTOMATICAS ===================
router.get('/reactions', (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`SELECT * FROM auto_reactions ${where} ORDER BY id ASC`).all(...args);
  res.json({
    enabled: getCfg(req.guildId, 'reactions_enabled', false),
    items: rows.map(r => ({ ...r, emojis: safeJson(r.emojis_json, []) }))
  });
});

router.put('/reactions/_enabled', (req, res) => {
  setCfg(req.guildId, 'reactions_enabled', !!req.body?.enabled);
  res.json({ ok: true });
});

router.post('/reactions', (req, res) => {
  const { channel_id, emojis } = req.body || {};
  if (!channel_id) return res.status(400).json({ error: 'channel_id obrigatorio' });
  const info = db.prepare(`
    INSERT INTO auto_reactions (guild_id, channel_id, emojis_json)
    VALUES (?, ?, ?)
  `).run(req.guildId || null, String(channel_id), JSON.stringify(Array.isArray(emojis) ? emojis : []));
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/reactions/:id', (req, res) => {
  const { channel_id, emojis } = req.body || {};
  db.prepare(`
    UPDATE auto_reactions SET
      channel_id = COALESCE(?, channel_id),
      emojis_json = COALESCE(?, emojis_json)
    WHERE id = ?
  `).run(channel_id ?? null, emojis ? JSON.stringify(emojis) : null, req.params.id);
  res.json({ ok: true });
});

router.delete('/reactions/:id', (req, res) => {
  db.prepare('DELETE FROM auto_reactions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// =================== REPOSTAGEM AUTOMATICA ===================
router.get('/repost', (req, res) => {
  res.json(getCfg(req.guildId, 'auto_repost', { enabled: false, time: '12:00' }));
});

router.put('/repost', (req, res) => {
  setCfg(req.guildId, 'auto_repost', {
    enabled: !!req.body?.enabled,
    time: String(req.body?.time || '12:00').slice(0, 5)
  });
  res.json({ ok: true });
});

// =================== LIMPEZA AUTOMATICA ===================
router.get('/cleanup', (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`SELECT * FROM auto_cleanups ${where} ORDER BY id ASC`).all(...args);
  res.json({
    enabled: getCfg(req.guildId, 'cleanup_enabled', false),
    items: rows
  });
});

router.put('/cleanup/_enabled', (req, res) => {
  setCfg(req.guildId, 'cleanup_enabled', !!req.body?.enabled);
  res.json({ ok: true });
});

router.post('/cleanup', (req, res) => {
  const { channel_id, clear_on_lock, lock_time, unlock_time } = req.body || {};
  if (!channel_id) return res.status(400).json({ error: 'channel_id obrigatorio' });
  const info = db.prepare(`
    INSERT INTO auto_cleanups (guild_id, channel_id, clear_on_lock, lock_time, unlock_time)
    VALUES (?,?,?,?,?)
  `).run(req.guildId || null, String(channel_id), clear_on_lock ? 1 : 0, lock_time || '22:00', unlock_time || '08:00');
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/cleanup/:id', (req, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE auto_cleanups SET
      channel_id = COALESCE(?, channel_id),
      clear_on_lock = COALESCE(?, clear_on_lock),
      lock_time = COALESCE(?, lock_time),
      unlock_time = COALESCE(?, unlock_time)
    WHERE id = ?
  `).run(
    b.channel_id ?? null,
    b.clear_on_lock != null ? (b.clear_on_lock ? 1 : 0) : null,
    b.lock_time ?? null,
    b.unlock_time ?? null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/cleanup/:id', (req, res) => {
  db.prepare('DELETE FROM auto_cleanups WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// =================== SUGESTOES ===================
router.get('/suggestions', (req, res) => {
  res.json(getCfg(req.guildId, 'suggestions_panel', {
    channel_id: '', post_channel_id: '',
    embed: {
      color: '#5865F2',
      title: 'Central de Sugestoes',
      description: 'Clique no botão abaixo para enviar sua sugestão!',
      footer: { text: '' }
    }
  }));
});

router.put('/suggestions', (req, res) => {
  setCfg(req.guildId, 'suggestions_panel', req.body || {});
  res.json({ ok: true });
});

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
