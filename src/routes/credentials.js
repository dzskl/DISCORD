const express = require('express');
const { getCredential, setCredential, listCredentialMeta } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { maskValue } = require('../secrets');
const audit = require('../audit');

const router = express.Router();

const CREDENTIAL_KEYS = [
  { key: 'DISCORD_TOKEN', label: 'Token do bot', group: 'discord', secret: true, validate: v => v.length > 40 || 'token muito curto' },
  { key: 'DISCORD_CLIENT_ID', label: 'Client ID', group: 'discord', secret: false, validate: v => /^\d{15,25}$/.test(v) || 'deve ser numero (15-25 digitos)' },
  { key: 'DISCORD_CLIENT_SECRET', label: 'Client Secret', group: 'discord', secret: true },
  { key: 'DISCORD_GUILD_ID', label: 'ID do servidor', group: 'discord', secret: false, validate: v => /^\d{15,25}$/.test(v) || 'deve ser numero' },
  { key: 'ADMIN_DISCORD_IDS', label: 'Admins (IDs)', group: 'discord', secret: false, validate: v => /^[\d,\s]+$/.test(v) || 'apenas IDs separados por virgula' },
  { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', group: 'stripe', secret: true, validate: v => v.startsWith('sk_') || 'deve comecar com sk_' },
  { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', group: 'stripe', secret: true, validate: v => v.startsWith('whsec_') || 'deve comecar com whsec_' },
  { key: 'MISTICPAY_CLIENT_ID', label: 'MisticPay Client ID', group: 'misticpay', secret: false },
  { key: 'MISTICPAY_CLIENT_SECRET', label: 'MisticPay Client Secret', group: 'misticpay', secret: true }
];

router.get('/', requireAuth, (req, res) => {
  const meta = listCredentialMeta();
  const out = CREDENTIAL_KEYS.map(spec => {
    const current = getCredential(spec.key);
    const m = meta[spec.key] || {};
    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      secret: spec.secret,
      configured: !!current,
      preview: current ? (spec.secret ? maskValue(current) : current) : null,
      source: m.in_db ? 'db' : (process.env[spec.key] ? 'env' : null),
      updated_at: m.updated_at || null
    };
  });
  res.json(out);
});

router.put('/:key', requireAuth, async (req, res) => {
  const spec = CREDENTIAL_KEYS.find(c => c.key === req.params.key);
  if (!spec) return res.status(404).json({ error: 'credencial desconhecida' });

  const value = (req.body?.value ?? '').toString().trim();
  if (value && spec.validate) {
    const valid = spec.validate(value);
    if (valid !== true) return res.status(400).json({ error: valid });
  }

  setCredential(spec.key, value || null, req.user?.username || 'admin');
  audit.log({ req, action: 'credential.update', target_type: 'credential', target_id: spec.key });

  if (['DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_CLIENT_ID'].includes(spec.key)) {
    setTimeout(() => require('../bot').restart().catch(e => require('../logger').error({ err: e.message }, 'erro reiniciando bot')), 100);
  }

  res.json({ ok: true, key: spec.key, preview: value ? (spec.secret ? maskValue(value) : value) : null });
});

router.delete('/:key', requireAuth, (req, res) => {
  const spec = CREDENTIAL_KEYS.find(c => c.key === req.params.key);
  if (!spec) return res.status(404).json({ error: 'credencial desconhecida' });
  setCredential(spec.key, null, req.user?.username || 'admin');
  audit.log({ req, action: 'credential.clear', target_type: 'credential', target_id: spec.key });
  res.json({ ok: true });
});

router.post('/bot/restart', requireAuth, async (req, res) => {
  try {
    await require('../bot').restart();
    audit.log({ req, action: 'bot.restart' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
