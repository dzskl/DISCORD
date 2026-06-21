// Paineis de Loja + config de checkout
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

// =================== PAINEIS ===================

router.get('/panels', (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`SELECT * FROM shop_panels ${where} ORDER BY created_at DESC`).all(...args);
  res.json(rows.map(r => ({
    ...r,
    product_ids: r.product_ids ? safeJson(r.product_ids, []) : []
  })));
});

router.post('/panels', (req, res) => {
  const { name, description, channel_id, embed_color, embed_title, embed_description, embed_footer, embed_image_url, product_ids } = req.body || {};
  if (!name) return res.status(400).json({ error: 'nome obrigatorio' });
  const info = db.prepare(`
    INSERT INTO shop_panels (guild_id, name, description, channel_id, embed_color, embed_title, embed_description, embed_footer, embed_image_url, product_ids)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.guildId || null,
    String(name).slice(0, 100),
    description || null,
    channel_id || null,
    embed_color || '#5865F2',
    embed_title || null,
    embed_description || null,
    embed_footer || null,
    embed_image_url || null,
    Array.isArray(product_ids) ? JSON.stringify(product_ids) : null
  );
  audit.log({ req, action: 'shop_panel.create', target_id: info.lastInsertRowid });
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/panels/:id', (req, res) => {
  const panel = db.prepare('SELECT * FROM shop_panels WHERE id=?').get(req.params.id);
  if (!panel) return res.status(404).json({ error: 'painel nao encontrado' });
  const { name, description, channel_id, active, embed_color, embed_title, embed_description, embed_footer, embed_image_url, product_ids } = req.body || {};
  db.prepare(`
    UPDATE shop_panels SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      channel_id = COALESCE(?, channel_id),
      active = COALESCE(?, active),
      embed_color = COALESCE(?, embed_color),
      embed_title = COALESCE(?, embed_title),
      embed_description = COALESCE(?, embed_description),
      embed_footer = COALESCE(?, embed_footer),
      embed_image_url = COALESCE(?, embed_image_url),
      product_ids = COALESCE(?, product_ids),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name ?? null,
    description ?? null,
    channel_id ?? null,
    active != null ? (active ? 1 : 0) : null,
    embed_color ?? null,
    embed_title ?? null,
    embed_description ?? null,
    embed_footer ?? null,
    embed_image_url ?? null,
    Array.isArray(product_ids) ? JSON.stringify(product_ids) : null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/panels/:id', (req, res) => {
  db.prepare('DELETE FROM shop_panels WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'shop_panel.delete', target_id: req.params.id });
  res.json({ ok: true });
});

// =================== CONFIG DE CHECKOUT ===================

router.get('/checkout-config', (req, res) => {
  if (!req.guildId) return res.json(defaultCheckoutConfig());
  const row = db.prepare('SELECT * FROM shop_checkout_config WHERE guild_id = ?').get(req.guildId);
  res.json(row ? maskApiKey(row) : defaultCheckoutConfig());
});

router.put('/checkout-config', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const body = req.body || {};
  // Não permite sobrescrever api_key se nao mandar (para nao zerar quando manda só outros campos)
  const cur = db.prepare('SELECT * FROM shop_checkout_config WHERE guild_id = ?').get(req.guildId) || {};
  const merged = { ...defaultCheckoutConfig(), ...cur, ...body };
  if (body.api_key === '') merged.api_key = null;
  else if (body.api_key) merged.api_key = body.api_key;

  db.prepare(`
    INSERT INTO shop_checkout_config (
      guild_id, api_key, repass_fee, currency, locale,
      brand_color_center, brand_color_border, brand_logo_url, qr_zoom, qr_position,
      instruction_enabled, instruction_message, instruction_button_name, instruction_button_url
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      api_key = excluded.api_key,
      repass_fee = excluded.repass_fee,
      currency = excluded.currency,
      locale = excluded.locale,
      brand_color_center = excluded.brand_color_center,
      brand_color_border = excluded.brand_color_border,
      brand_logo_url = excluded.brand_logo_url,
      qr_zoom = excluded.qr_zoom,
      qr_position = excluded.qr_position,
      instruction_enabled = excluded.instruction_enabled,
      instruction_message = excluded.instruction_message,
      instruction_button_name = excluded.instruction_button_name,
      instruction_button_url = excluded.instruction_button_url
  `).run(
    req.guildId,
    merged.api_key || null,
    merged.repass_fee ? 1 : 0,
    merged.currency || 'BRL',
    merged.locale || 'pt-BR',
    merged.brand_color_center || '#8B5CF6',
    merged.brand_color_border || '#6D28D9',
    merged.brand_logo_url || null,
    parseInt(merged.qr_zoom) || 100,
    merged.qr_position === 'thumbnail' ? 'thumbnail' : 'main',
    merged.instruction_enabled ? 1 : 0,
    merged.instruction_message || null,
    merged.instruction_button_name || null,
    merged.instruction_button_url || null
  );
  res.json({ ok: true });
});

function defaultCheckoutConfig() {
  return {
    api_key_present: false,
    repass_fee: false,
    currency: 'BRL',
    locale: 'pt-BR',
    brand_color_center: '#8B5CF6',
    brand_color_border: '#6D28D9',
    brand_logo_url: null,
    qr_zoom: 100,
    qr_position: 'main',
    instruction_enabled: false,
    instruction_message: '',
    instruction_button_name: '',
    instruction_button_url: ''
  };
}

function maskApiKey(row) {
  const masked = row.api_key ? row.api_key.slice(0, 6) + '••••••••' + row.api_key.slice(-4) : null;
  return {
    ...row,
    api_key: undefined,
    api_key_masked: masked,
    api_key_present: !!row.api_key,
    repass_fee: !!row.repass_fee,
    instruction_enabled: !!row.instruction_enabled
  };
}

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
