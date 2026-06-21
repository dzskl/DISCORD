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

// POST /api/api-keys/:id/rotate — gera novo secret, revoga o antigo
router.post('/:id/rotate', (req, res) => {
  const id = parseInt(req.params.id);
  const k = keys.rotate(req.appUser.id, id);
  if (!k) return res.status(404).json({ error: 'chave nao encontrada ou ja revogada' });
  audit.log({ req, action: 'api_key.rotate', target_type: 'api_key', target_id: id, details: { new_id: k.id } });
  res.json(k);   // contem full_key — exibido UMA VEZ
});

// GET /api/api-keys/:id/audit — historico de uso da chave (cookie auth)
// Filtros: ?method=GET&path=/sales&status=200&since=<unix>&limit=N
router.get('/:id/audit', (req, res) => {
  const { db } = require('../database/connection');
  const id = parseInt(req.params.id);
  const k = db.prepare(`SELECT user_id FROM api_keys WHERE id=?`).get(id);
  if (!k || k.user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrada' });

  const wheres = ['api_key_id = ?'];
  const args = [id];
  if (req.query.method) { wheres.push('method = ?'); args.push(String(req.query.method).toUpperCase()); }
  if (req.query.path)   { wheres.push('path LIKE ?'); args.push(`%${req.query.path}%`); }
  if (req.query.status) { wheres.push('status_code = ?'); args.push(parseInt(req.query.status)); }
  if (req.query.since)  { wheres.push('created_at >= ?'); args.push(parseInt(req.query.since)); }
  const limit = Math.min(500, parseInt(req.query.limit) || 100);

  const rows = db.prepare(`
    SELECT id, method, path, status_code, ip, user_agent, test_mode, duration_ms, created_at
    FROM api_key_audit
    WHERE ${wheres.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...args, limit);
  res.json({ audit: rows, count: rows.length });
});

// GET /api/api-keys/audit/search — busca cross-key (todas as chaves do user)
// Filtros: status_code=400,401,403 (csv), since, path_contains, ip
router.get('/audit/search', (req, res) => {
  const { db } = require('../database/connection');
  const wheres = ['user_id = ?'];
  const args = [req.appUser.id];
  if (req.query.status_code) {
    const codes = String(req.query.status_code).split(',').map(s => parseInt(s)).filter(Boolean);
    if (codes.length) {
      wheres.push(`status_code IN (${codes.map(() => '?').join(',')})`);
      args.push(...codes);
    }
  }
  if (req.query.since)         { wheres.push('created_at >= ?'); args.push(parseInt(req.query.since)); }
  if (req.query.path_contains) { wheres.push('path LIKE ?'); args.push(`%${req.query.path_contains}%`); }
  if (req.query.ip)            { wheres.push('ip = ?'); args.push(String(req.query.ip)); }
  const limit = Math.min(500, parseInt(req.query.limit) || 100);

  const rows = db.prepare(`
    SELECT id, api_key_id, method, path, status_code, ip, user_agent, test_mode, duration_ms, created_at
    FROM api_key_audit
    WHERE ${wheres.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...args, limit);
  res.json({ audit: rows, count: rows.length });
});

module.exports = router;
