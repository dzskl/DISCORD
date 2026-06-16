// CRUD de API keys do usuario.

const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const keys = require('../services/api-keys.service');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/scopes', (req, res) => {
  res.json({ scopes: keys.ALL_SCOPES });
});

router.get('/', (req, res) => {
  res.json({ keys: keys.list(req.appUser.id) });
});

router.post('/', (req, res) => {
  const { label, scopes, expires_in_days, guild_id } = req.body || {};
  try {
    const k = keys.generate({
      user_id: req.appUser.id,
      guild_id: guild_id || req.guildId || null,
      label, scopes, expires_in_days
    });
    audit.log({ req, action: 'api_key.create', target_type: 'api_key', target_id: k.id, details: { label, scopes } });
    res.status(201).json(k);
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

router.delete('/:id', (req, res) => {
  const ok = keys.revoke(req.appUser.id, parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'nao encontrada' });
  audit.log({ req, action: 'api_key.revoke', target_type: 'api_key', target_id: parseInt(req.params.id) });
  res.json({ ok: true });
});

// GET /api/api-keys/:id/audit — historico de uso da chave (cookie auth)
router.get('/:id/audit', (req, res) => {
  const { db } = require('../database/connection');
  const id = parseInt(req.params.id);
  const k = db.prepare(`SELECT user_id FROM api_keys WHERE id=?`).get(id);
  if (!k || k.user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrada' });
  const rows = db.prepare(`
    SELECT id, method, path, status_code, ip, user_agent, test_mode, duration_ms, created_at
    FROM api_key_audit
    WHERE api_key_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(id);
  res.json({ audit: rows });
});

module.exports = router;
