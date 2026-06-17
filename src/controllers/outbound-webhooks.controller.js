// CRUD de outbound webhooks (vendedor recebe POST nosso).

const express = require('express');
const crypto = require('crypto');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');
const obService = require('../services/outbound-webhooks.service');

const router = express.Router();
router.use(requireAuth);

const ALL_EVENTS = ['sale.paid', 'sale.refunded', 'sale.med_returned', '*'];

router.get('/events', (req, res) => {
  res.json({ events: ALL_EVENTS });
});

// GET /api/outbound-webhooks/source-ips — IPs do BotDash que enviam webhooks.
// Vendedor pode usar pra IP allowlist no firewall dele.
router.get('/source-ips', (req, res) => {
  // Em deploy real, listar IPs publicos do cluster. Por enquanto, expomos via env.
  const ips = String(process.env.WEBHOOK_SOURCE_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  res.json({
    ips,
    note: ips.length === 0
      ? 'Configure WEBHOOK_SOURCE_IPS no env do BotDash. Em multi-replica deploy, listar todos.'
      : null
  });
});

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, url, events, active, failure_count, disabled_at,
           last_success_at, last_attempt_at, created_at, guild_id
    FROM outbound_webhooks
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.appUser.id);
  res.json({
    webhooks: rows.map(r => ({
      ...r,
      events: (() => { try { return JSON.parse(r.events || '[]'); } catch { return []; } })()
    }))
  });
});

router.post('/', (req, res) => {
  const { url, events = ['sale.paid'], guild_id } = req.body || {};
  if (!/^https?:\/\//.test(String(url || ''))) {
    return res.status(400).json({ error: 'url precisa ser http(s)' });
  }
  const invalid = events.filter(e => !ALL_EVENTS.includes(e));
  if (invalid.length) return res.status(400).json({ error: `eventos invalidos: ${invalid.join(',')}` });

  const secret = crypto.randomBytes(24).toString('base64url');
  const info = db.prepare(`
    INSERT INTO outbound_webhooks (user_id, guild_id, url, secret, events)
    VALUES (?,?,?,?,?)
  `).run(req.appUser.id, guild_id || req.guildId || null, url, secret, JSON.stringify(events));

  audit.log({ req, action: 'webhook.create', target_type: 'webhook', target_id: info.lastInsertRowid, details: { url, events } });
  res.status(201).json({
    id: info.lastInsertRowid,
    url,
    events,
    secret,           // **so retorna uma vez aqui** — vendedor copia
    active: true
  });
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const wh = db.prepare(`SELECT user_id FROM outbound_webhooks WHERE id=?`).get(id);
  if (!wh || wh.user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrada' });

  const { url, events, active } = req.body || {};
  const updates = [];
  const args = [];
  if (url) {
    if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'url invalida' });
    updates.push('url = ?'); args.push(url);
  }
  if (events) {
    const invalid = events.filter(e => !ALL_EVENTS.includes(e));
    if (invalid.length) return res.status(400).json({ error: 'eventos invalidos' });
    updates.push('events = ?'); args.push(JSON.stringify(events));
  }
  if (active !== undefined) {
    updates.push('active = ?'); args.push(active ? 1 : 0);
    if (active) { updates.push('failure_count = 0'); updates.push('disabled_at = NULL'); }
  }
  if (!updates.length) return res.status(400).json({ error: 'nada pra atualizar' });
  db.prepare(`UPDATE outbound_webhooks SET ${updates.join(', ')} WHERE id = ?`).run(...args, id);
  res.json({ ok: true });
});

router.post('/:id/rotate-secret', (req, res) => {
  const id = parseInt(req.params.id);
  const wh = db.prepare(`SELECT user_id FROM outbound_webhooks WHERE id=?`).get(id);
  if (!wh || wh.user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrada' });
  const newSecret = crypto.randomBytes(24).toString('base64url');
  db.prepare(`UPDATE outbound_webhooks SET secret=? WHERE id=?`).run(newSecret, id);
  audit.log({ req, action: 'webhook.rotate_secret', target_type: 'webhook', target_id: id });
  res.json({ ok: true, secret: newSecret });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const r = db.prepare(`DELETE FROM outbound_webhooks WHERE id = ? AND user_id = ?`).run(id, req.appUser.id);
  if (!r.changes) return res.status(404).json({ error: 'nao encontrada' });
  audit.log({ req, action: 'webhook.delete', target_type: 'webhook', target_id: id });
  res.json({ ok: true });
});

router.get('/:id/attempts', (req, res) => {
  const id = parseInt(req.params.id);
  const wh = db.prepare(`SELECT user_id FROM outbound_webhooks WHERE id=?`).get(id);
  if (!wh || wh.user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrada' });
  const rows = db.prepare(`
    SELECT id, event, status_code, error, attempt_number, succeeded, duration_ms, created_at
    FROM outbound_webhook_attempts
    WHERE webhook_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(id);
  res.json({ attempts: rows });
});

router.post('/:id/test', async (req, res) => {
  const id = parseInt(req.params.id);
  const wh = db.prepare(`SELECT * FROM outbound_webhooks WHERE id=? AND user_id=?`).get(id, req.appUser.id);
  if (!wh) return res.status(404).json({ error: 'nao encontrada' });
  const r = await obService.sendOne(wh, 'webhook.test', {
    test: true,
    message: 'ping do BotDash',
    user_id: req.appUser.id
  });
  res.json(r);
});

router.post('/attempts/:attempt_id/resend', async (req, res) => {
  try {
    const r = await obService.resend(parseInt(req.params.attempt_id), req.appUser.id);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(e.code === 'forbidden' ? 403 : 404).json({ error: e.message });
  }
});

module.exports = router;
