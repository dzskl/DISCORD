// Endpoints simples pra invite_tracker, giveaway_advanced, ticket_panels, ecloud_setup.
// Tudo persiste em guild_config como JSON.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

function getCfg(guildId, key, fallback = {}) {
  if (!guildId) return fallback;
  const row = db.prepare('SELECT value FROM guild_config WHERE guild_id=? AND key=?').get(guildId, key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function setCfg(guildId, key, value) {
  if (!guildId) throw new Error('guild_id obrigatorio');
  db.prepare(`
    INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value=excluded.value
  `).run(guildId, key, JSON.stringify(value));
}

// ============ INVITE TRACKER ============
router.get('/invite-tracker', (req, res) => {
  res.json(getCfg(req.guildId, 'invite_tracker', {
    enabled: false, log_channel: '',
    entry_message: 'Bem-vindo {member}! Convidado por {inviter} ({invites} convites)',
    leave_message: '{membername} saiu. Convidado por {invitername}',
    entry_embed: null,
    leave_embed: null,
    role_rewards: []   // [{ enabled, persistent, meta_invites, role_ids:[] }]
  }));
});
router.put('/invite-tracker', (req, res) => {
  setCfg(req.guildId, 'invite_tracker', req.body || {});
  res.json({ ok: true });
});

// ============ GIVEAWAYS ADVANCED ============
router.get('/giveaways-advanced', (req, res) => {
  res.json(getCfg(req.guildId, 'giveaway_defaults', {
    delivery_mode: 'none',   // none|role|code|message
    requirements: { roles: [], min_invites: 0, min_account_age_days: 0 },
    tasks: []                // [{ kind: 'join_server'|'follow_ig'|'subscribe', url: '...' }]
  }));
});
router.put('/giveaways-advanced', (req, res) => {
  setCfg(req.guildId, 'giveaway_defaults', req.body || {});
  res.json({ ok: true });
});

// ============ TICKET PANELS ============
router.get('/ticket-panels', (req, res) => {
  res.json(getCfg(req.guildId, 'ticket_panels', { panels: [] }));
});
router.put('/ticket-panels', (req, res) => {
  setCfg(req.guildId, 'ticket_panels', req.body || { panels: [] });
  res.json({ ok: true });
});

// ============ ECLOUD ============
router.get('/ecloud-state', (req, res) => {
  const cfg = getCfg(req.guildId, 'ecloud_v2', { bot_registered: false, key_linked: false });
  res.json({
    bot_registered: !!cfg.bot_registered,
    key_linked: !!cfg.key_linked,
    redirect_uri: (process.env.PUBLIC_URL || '') + '/auth/discord/callback',
    target_guild_id: cfg.target_guild_id || ''
  });
});

router.post('/ecloud-register', (req, res) => {
  const cfg = getCfg(req.guildId, 'ecloud_v2', {});
  cfg.bot_registered = true;
  cfg.registered_at = Math.floor(Date.now() / 1000);
  setCfg(req.guildId, 'ecloud_v2', cfg);
  res.json({ ok: true });
});

router.post('/ecloud-link', (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'chave obrigatoria' });
  const cfg = getCfg(req.guildId, 'ecloud_v2', {});
  cfg.key_linked = true;
  cfg.key_hash = require('crypto').createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
  setCfg(req.guildId, 'ecloud_v2', cfg);
  res.json({ ok: true });
});

module.exports = router;
