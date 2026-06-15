// Checkout via "Wallet" (PSP do vendedor, modelo intermediario).
//
// POST /api/checkout/wallet/create
//   body: { provider, items: [{product_id, quantity}], discord_id, coupon_code?, affiliate_code?, pay_currency? }
//   resp: { sale_id, provider, charge_id, qr_code, qr_image, pay_url, expires_at, amount_cents }
//
// Cria a `sale` em status='pending' com o provider/charge_id e retorna os
// dados pro frontend renderizar (QR PIX, endereco cripto, link Stripe, etc.).
//
// Pagamento eh confirmado depois pelo /webhooks/wallet/:provider, que chama
// fulfillment.service.fulfillSale(saleId).

const express = require('express');
const { db } = require('../database/connection');
const registry = require('../providers/wallet');
const wallet = require('../config/wallet-providers');
const plans = require('../config/plans');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/create', async (req, res) => {
  const { provider, items, discord_id, coupon_code, affiliate_code, pay_currency } = req.body || {};

  // 1. Valida provider
  const meta = wallet.getProvider(provider);
  if (!meta) return res.status(400).json({ error: 'provider invalido' });
  if (!registry.isSupported(provider)) return res.status(400).json({ error: 'provider ainda nao suportado nesta versao' });
  if (!registry.isConfigured(provider)) return res.status(503).json({ error: 'provider nao configurado pelo vendedor', provider });

  // 2. Trava por plano
  const plan = plans.planFor(req);
  const featureKey = wallet.providerFeature(provider);
  if (featureKey && !plan.features[featureKey]) {
    return res.status(402).json({ error: 'provider exige upgrade de plano', required_feature: featureKey });
  }

  // 3. Valida items
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items vazio' });
  if (!/^\d{16,20}$/.test(String(discord_id || ''))) return res.status(400).json({ error: 'discord_id invalido' });

  let amount = 0;
  const cartDetail = [];
  for (const it of items) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.product_id);
    if (!p) return res.status(404).json({ error: `produto ${it.product_id} nao existe` });
    if (p.stock != null && p.stock < (it.quantity || 1)) {
      return res.status(409).json({ error: `produto "${p.name}" sem estoque`, product_id: p.id });
    }
    amount += p.price_cents * (it.quantity || 1);
    cartDetail.push({ id: p.id, q: it.quantity || 1 });
  }

  // 4. Cupom (opcional)
  let couponId = null;
  if (coupon_code) {
    const c = db.prepare(`SELECT * FROM coupons WHERE UPPER(code)=UPPER(?) AND active=1`).get(coupon_code);
    if (c) {
      const discount = Math.round(amount * c.discount_percent / 100);
      amount = Math.max(100, amount - discount);
      couponId = c.id;
    }
  }

  // 5. Afiliado (opcional)
  let affiliateId = null;
  if (affiliate_code) {
    const aff = db.prepare(`SELECT id FROM affiliates WHERE UPPER(code)=UPPER(?) AND active=1`).get(affiliate_code);
    if (aff) affiliateId = aff.id;
  }

  // 6. Cria sale pendente
  const guildId = req.guildId || null;
  const firstProductId = cartDetail[0]?.id || null;
  const info = db.prepare(`
    INSERT INTO sales (product_id, discord_id, amount_cents, status, cart_items, guild_id, affiliate_id, provider, provider_pay_currency)
    VALUES (?,?,?,'pending',?,?,?,?,?)
  `).run(firstProductId, discord_id, amount, JSON.stringify(cartDetail), guildId, affiliateId, provider, pay_currency || null);
  const saleId = info.lastInsertRowid;

  // 7. Cria cobranca no provider
  const baseUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  const webhookUrl = baseUrl ? `${baseUrl}/webhooks/wallet/${provider}` : undefined;

  try {
    const connector = registry.instantiate(provider);
    const charge = await connector.createCharge({
      amount_cents: amount,
      description: `BotDash #${saleId}`,
      external_reference: `sale-${saleId}`,
      order_id: `sale-${saleId}`,
      order_description: `BotDash #${saleId}`,
      webhook_url: webhookUrl,
      ipn_callback_url: webhookUrl,
      pay_currency: pay_currency || undefined,
      payer: { email: req.body?.email || undefined }
    });

    db.prepare(`
      UPDATE sales SET
        provider_charge_id = ?,
        provider_expires_at = ?,
        provider_raw = ?
      WHERE id = ?
    `).run(charge.external_id, charge.expires_at || null, JSON.stringify(charge.raw || {}), saleId);

    res.json({
      sale_id: saleId,
      provider,
      charge_id: charge.external_id,
      qr_code: charge.qr_code,
      qr_image: charge.qr_image,
      pay_url: charge.pay_url,
      expires_at: charge.expires_at,
      amount_cents: amount,
      pay_currency: charge.pay_currency || null,
      pay_amount: charge.pay_amount || null
    });
  } catch (e) {
    db.prepare(`UPDATE sales SET status='failed' WHERE id=?`).run(saleId);
    logger.warn({ err: e.message, code: e.code, provider, sale_id: saleId }, 'wallet checkout falhou');
    res.status(502).json({ error: e.message || 'erro ao criar cobranca', code: e.code });
  }
});

// Status polling: cliente consulta status da sale enquanto aguarda pagamento
router.get('/status/:sale_id', (req, res) => {
  const s = db.prepare(`SELECT id, status, provider, provider_charge_id, paid_at FROM sales WHERE id=?`).get(req.params.sale_id);
  if (!s) return res.status(404).json({ error: 'sale nao encontrada' });
  res.json(s);
});

// Refund: vendedor solicita estorno via API da PSP (so MP e Asaas suportam
// nesta versao — NOWPayments cripto nao tem refund).
const { requireAuth } = require('../middlewares/auth.middleware');
router.post('/refund/:sale_id', requireAuth, async (req, res) => {
  const sale = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.sale_id);
  if (!sale) return res.status(404).json({ error: 'sale nao encontrada' });
  if (sale.status !== 'paid') return res.status(400).json({ error: 'sale nao esta paga' });
  if (!sale.provider || !sale.provider_charge_id) return res.status(400).json({ error: 'sale sem provider associado' });

  // Garante que o usuario eh dono da guild dessa sale
  if (req.guildId && sale.guild_id && sale.guild_id !== req.guildId) {
    return res.status(403).json({ error: 'sale de outra guild' });
  }

  if (!registry.isSupported(sale.provider) || !registry.isConfigured(sale.provider)) {
    return res.status(503).json({ error: 'provider nao configurado' });
  }

  const connector = registry.instantiate(sale.provider);
  if (typeof connector.refundPayment !== 'function') {
    return res.status(501).json({ error: `provider ${sale.provider} nao suporta refund via API` });
  }

  try {
    const r = await connector.refundPayment(sale.provider_charge_id, {
      value: req.body?.value || undefined,
      description: req.body?.reason || 'refund via BotDash'
    });
    db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
    require('../services/audit.service').log({
      req, action: 'sale.refund',
      target_type: 'sale', target_id: sale.id,
      details: { provider: sale.provider, charge_id: sale.provider_charge_id }
    });
    res.json({ ok: true, raw: r });
  } catch (e) {
    logger.warn({ err: e.message, sale_id: sale.id }, 'refund falhou');
    res.status(502).json({ error: e.message, code: e.code });
  }
});

// GET /api/checkout/wallet/sales — lista vendas processadas via Wallet
// (paid / refunded / med_returned) com filtros pra UI de disputa
router.get('/sales', requireAuth, (req, res) => {
  const status = String(req.query.status || '').trim() || null;   // paid | refunded | med_returned
  const provider = String(req.query.provider || '').trim() || null;
  const limit = Math.min(100, parseInt(req.query.limit) || 50);

  const wheres = ['provider IS NOT NULL'];
  const args = [];
  if (req.guildId) { wheres.push('(guild_id = ? OR guild_id IS NULL)'); args.push(req.guildId); }
  if (status)      { wheres.push('status = ?'); args.push(status); }
  if (provider)    { wheres.push('provider = ?'); args.push(provider); }

  const rows = db.prepare(`
    SELECT s.id, s.discord_id, s.discord_tag, s.amount_cents, s.net_to_owner_cents,
           s.status, s.provider, s.provider_charge_id, s.provider_pay_currency,
           s.paid_at, s.created_at, s.guild_id,
           p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE ${wheres.join(' AND ')}
    ORDER BY COALESCE(s.paid_at, s.created_at) DESC
    LIMIT ?
  `).all(...args, limit);

  res.json({ sales: rows });
});

module.exports = router;
