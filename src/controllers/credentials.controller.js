const express = require('express');
const { getCredential, setCredential, listCredentialMeta } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const { maskValue } = require('../utils/encryption');
const audit = require('../services/audit.service');
const wallet = require('../config/wallet-providers');

const router = express.Router();

const CREDENTIAL_KEYS = [
  { key: 'DISCORD_TOKEN', label: 'Token do bot', group: 'discord', secret: true, validate: v => v.length > 40 || 'token muito curto' },
  { key: 'DISCORD_CLIENT_ID', label: 'Client ID', group: 'discord', secret: false, validate: v => /^\d{15,25}$/.test(v) || 'deve ser numero (15-25 digitos)' },
  { key: 'DISCORD_CLIENT_SECRET', label: 'Client Secret', group: 'discord', secret: true },
  { key: 'DISCORD_GUILD_ID', label: 'ID do servidor', group: 'discord', secret: false, validate: v => /^\d{15,25}$/.test(v) || 'deve ser numero' },
  { key: 'ADMIN_DISCORD_IDS', label: 'Admins (IDs)', group: 'discord', secret: false, validate: v => /^[\d,\s]+$/.test(v) || 'apenas IDs separados por virgula' },
  { key: 'STRIPE_PRICE_PRO_MONTHLY', label: 'Stripe Price ID — Plano Pro Mensal', group: 'billing', secret: false, validate: v => v.startsWith('price_') || 'deve começar com price_' },
  { key: 'STRIPE_BILLING_WEBHOOK_SECRET', label: 'Stripe Billing Webhook Secret', group: 'billing', secret: true, validate: v => v.startsWith('whsec_') || 'deve começar com whsec_' },
  { key: 'RESEND_API_KEY', label: 'Resend API Key (recomendado)', group: 'email', secret: true, validate: v => v.startsWith('re_') || 'deve começar com re_' },
  { key: 'RESEND_FROM', label: 'Resend From (Brand <email@domain>)', group: 'email', secret: false },
  { key: 'SMTP_HOST', label: 'SMTP Host (alternativa)', group: 'email', secret: false },
  { key: 'SMTP_PORT', label: 'SMTP Port', group: 'email', secret: false },
  { key: 'SMTP_USER', label: 'SMTP User', group: 'email', secret: false },
  { key: 'SMTP_PASS', label: 'SMTP Password', group: 'email', secret: true },
  { key: 'SMTP_FROM', label: 'SMTP From email', group: 'email', secret: false },
  { key: 'BRAND_NAME', label: 'Nome da marca (nos emails)', group: 'email', secret: false }
];

// Adiciona credenciais dos PSPs do catalogo wallet-providers.js
// (Stripe, MisticPay e outros agora vem dessa fonte unica)
for (const p of wallet.listProviders()) {
  for (const c of p.credentials) {
    if (CREDENTIAL_KEYS.find(x => x.key === c.key)) continue;   // evita duplicar
    let validate;
    if (c.key === 'STRIPE_SECRET_KEY')     validate = v => v.startsWith('sk_') || 'deve comecar com sk_';
    if (c.key === 'STRIPE_WEBHOOK_SECRET') validate = v => v.startsWith('whsec_') || 'deve comecar com whsec_';
    CREDENTIAL_KEYS.push({
      key: c.key,
      label: `${p.label}: ${c.label}`,
      group: `psp:${p.id}`,
      secret: c.type === 'secret',
      validate
    });
  }
}

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
    setTimeout(() => require('../services/bot.service').restart().catch(e => require('../utils/logger').error({ err: e.message }, 'erro reiniciando bot')), 100);
  }
  if (spec.key.startsWith('SMTP_')) {
    require('../services/email.service').invalidateTransport();
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
    await require('../services/bot.service').restart();
    audit.log({ req, action: 'bot.restart' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/email/test', requireAuth, async (req, res) => {
  const email = require('../services/email.service');
  if (!email.isConfigured()) return res.status(503).json({ error: 'configure Resend ou SMTP primeiro' });
  const to = (req.body?.to || req.appUser?.email || '').trim();
  if (!to) return res.status(400).json({ error: 'email destino obrigatorio' });
  const r = await email.send({
    to,
    subject: 'Teste de email — BotDash',
    html: '<h1>Funcionou ✓</h1><p>Se você está vendo isso, seu SMTP/Resend está configurado corretamente.</p>'
  });
  res.json(r);
});

module.exports = router;
