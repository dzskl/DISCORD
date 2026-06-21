// Conta do user (user-level): empresa, API key, integrações.
const express = require('express');
const crypto = require('crypto');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const u = db.prepare(`
    SELECT id, email, display_name, company_name, company_logo_url, company_color,
           webhook_url, callback_url, repass_fee_to_customer, api_key, api_key_created_at,
           totp_enabled
    FROM users WHERE id = ?
  `).get(req.appUser.id);
  if (!u) return res.status(404).json({ error: 'user nao encontrado' });
  // Não retorna a key inteira, só mascarada (clica em "show" pra ver na hora)
  const masked = u.api_key ? u.api_key.slice(0, 8) + '••••••••' + u.api_key.slice(-4) : null;
  res.json({
    email: u.email,
    display_name: u.display_name,
    company_name: u.company_name || '',
    company_logo_url: u.company_logo_url || '',
    company_color: u.company_color || '#8B5CF6',
    webhook_url: u.webhook_url || '',
    callback_url: u.callback_url || '',
    repass_fee_to_customer: !!u.repass_fee_to_customer,
    api_key_present: !!u.api_key,
    api_key_masked: masked,
    api_key_created_at: u.api_key_created_at,
    // exposed como twofa_enabled pra match com naming do frontend
    twofa_enabled: !!u.totp_enabled
  });
});

router.put('/', (req, res) => {
  const { company_name, company_logo_url, company_color, webhook_url, callback_url, repass_fee_to_customer } = req.body || {};
  if (company_color && !/^#[0-9a-fA-F]{6}$/.test(company_color)) {
    return res.status(400).json({ error: 'company_color deve ser hex #RRGGBB' });
  }
  if (company_logo_url && !/^https?:\/\//.test(company_logo_url)) {
    return res.status(400).json({ error: 'company_logo_url deve ser http(s)' });
  }
  if (webhook_url && !/^https?:\/\//.test(webhook_url)) {
    return res.status(400).json({ error: 'webhook_url deve ser http(s)' });
  }
  if (callback_url && !/^https?:\/\//.test(callback_url)) {
    return res.status(400).json({ error: 'callback_url deve ser http(s)' });
  }
  db.prepare(`
    UPDATE users SET
      company_name = COALESCE(?, company_name),
      company_logo_url = COALESCE(?, company_logo_url),
      company_color = COALESCE(?, company_color),
      webhook_url = COALESCE(?, webhook_url),
      callback_url = COALESCE(?, callback_url),
      repass_fee_to_customer = COALESCE(?, repass_fee_to_customer)
    WHERE id = ?
  `).run(
    company_name != null ? String(company_name).slice(0, 120) : null,
    company_logo_url ?? null,
    company_color ?? null,
    webhook_url ?? null,
    callback_url ?? null,
    repass_fee_to_customer != null ? (repass_fee_to_customer ? 1 : 0) : null,
    req.appUser.id
  );
  audit.log({ req, action: 'conta.update', details: { fields: Object.keys(req.body || {}) } });
  res.json({ ok: true });
});

// Gera nova API key — exige 2FA ativo
router.post('/api-key/generate', (req, res) => {
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.appUser.id);
  if (!u?.totp_enabled) {
    return res.status(403).json({ error: 'Ative 2FA antes de gerar API Key', twofa_required: true });
  }
  const key = 'bd_' + crypto.randomBytes(32).toString('hex');
  db.prepare(`UPDATE users SET api_key=?, api_key_created_at=strftime('%s','now') WHERE id=?`).run(key, req.appUser.id);
  audit.log({ req, action: 'conta.api_key_generated' });
  res.json({ ok: true, api_key: key }); // só retorna inteira UMA vez
});

// Revoga
router.delete('/api-key', (req, res) => {
  db.prepare('UPDATE users SET api_key=NULL, api_key_created_at=NULL WHERE id=?').run(req.appUser.id);
  audit.log({ req, action: 'conta.api_key_revoked' });
  res.json({ ok: true });
});

module.exports = router;
