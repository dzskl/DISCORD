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

const { requireAuth } = require('../middlewares/auth.middleware');
const { apiKeyOrAuth } = require('../middlewares/api-key.middleware');

// Timeline da sale: eventos de criacao, pagamento, webhooks recebidos, refund.
router.get('/sale/:sale_id/timeline', requireAuth, (req, res) => {
  const sale = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.sale_id);
  if (!sale) return res.status(404).json({ error: 'sale nao encontrada' });

  const events = [];
  events.push({
    type: 'created', at: sale.created_at,
    label: 'Cobranca criada',
    detail: `${sale.provider || 'legado'} · R$ ${(sale.amount_cents/100).toFixed(2).replace('.', ',')}`
  });
  if (sale.paid_at) {
    events.push({
      type: 'paid', at: sale.paid_at,
      label: 'Pagamento confirmado',
      detail: sale.provider_charge_id ? `charge_id: ${sale.provider_charge_id}` : ''
    });
  }
  if (sale.expires_at && sale.status === 'expired') {
    events.push({ type: 'expired', at: sale.expires_at, label: 'Cobranca expirada' });
  }
  if (sale.status === 'refunded') {
    events.push({ type: 'refunded', at: sale.paid_at, label: 'Reembolso processado' });
  }
  if (sale.status === 'med_returned') {
    events.push({ type: 'med', at: sale.paid_at, label: 'Devolucao MED (banco emissor)', detail: 'Saque correspondente bloqueado' });
  }

  // Webhooks recebidos
  try {
    const whs = db.prepare(`
      SELECT id, gateway, event_type, status, received_at, processed_at, error, signature_ok
      FROM webhook_events
      WHERE sale_id = ?
      ORDER BY received_at ASC
    `).all(sale.id);
    for (const w of whs) {
      events.push({
        type: 'webhook', at: w.received_at,
        label: `webhook ${w.gateway} (${w.event_type || '?'})`,
        detail: `${w.status}${w.signature_ok === 0 ? ' · sem HMAC' : ''}${w.error ? ' · ' + w.error : ''}`
      });
    }
  } catch {}

  // Recon cripto
  if (sale.recon_checked_at) {
    const ok = sale.recon_status === 'ok';
    events.push({
      type: ok ? 'recon_ok' : 'recon_flag',
      at: sale.recon_checked_at,
      label: ok ? 'Tx on-chain validada' : '⚠ Recon flagou divergencia',
      detail: ok ? '' : (sale.recon_status || '').slice(0, 200)
    });
  }

  events.sort((a, b) => (a.at || 0) - (b.at || 0));

  res.json({
    sale: {
      id: sale.id, status: sale.status, provider: sale.provider,
      amount_cents: sale.amount_cents, discord_id: sale.discord_id,
      discord_tag: sale.discord_tag, charge_id: sale.provider_charge_id
    },
    events
  });
});

// Refund: vendedor solicita estorno via API da PSP (so MP e Asaas suportam
// nesta versao — NOWPayments cripto nao tem refund).
router.post('/refund/:sale_id', apiKeyOrAuth('write:refund'), async (req, res) => {
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
    try {
      const ob = require('../services/outbound-webhooks.service');
      ob.dispatch('sale.refunded', {
        user_id: req.appUser?.id, guild_id: sale.guild_id, sale_id: sale.id,
        amount_cents: sale.amount_cents, provider: sale.provider,
        provider_charge_id: sale.provider_charge_id
      }).catch(() => {});
    } catch {}
    res.json({ ok: true, raw: r });
  } catch (e) {
    logger.warn({ err: e.message, sale_id: sale.id }, 'refund falhou');
    res.status(502).json({ error: e.message, code: e.code });
  }
});

// POST /api/checkout/wallet/refund/bulk — reembolsa varias sales de uma vez
// body: { sale_ids: [1,2,3], reason?: '...' }
// retorna por sale_id: { ok, error?, code? }
router.post('/refund/bulk', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.sale_ids) ? req.body.sale_ids.map(x => parseInt(x)).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'sale_ids vazio' });
  if (ids.length > 50) return res.status(400).json({ error: 'maximo 50 por batch' });
  const reason = String(req.body?.reason || 'bulk refund via BotDash').slice(0, 200);

  const results = {};
  for (const id of ids) {
    const sale = db.prepare(`SELECT * FROM sales WHERE id=?`).get(id);
    if (!sale)             { results[id] = { ok: false, error: 'nao encontrada' }; continue; }
    if (sale.status !== 'paid') { results[id] = { ok: false, error: 'nao paga' }; continue; }
    if (!sale.provider || !sale.provider_charge_id) {
      results[id] = { ok: false, error: 'sem provider' }; continue;
    }
    if (req.guildId && sale.guild_id && sale.guild_id !== req.guildId) {
      results[id] = { ok: false, error: 'outra guild' }; continue;
    }
    if (!registry.isSupported(sale.provider) || !registry.isConfigured(sale.provider)) {
      results[id] = { ok: false, error: 'provider sem config' }; continue;
    }
    const connector = registry.instantiate(sale.provider);
    if (typeof connector.refundPayment !== 'function') {
      results[id] = { ok: false, error: 'provider sem refund' }; continue;
    }
    try {
      await connector.refundPayment(sale.provider_charge_id, { description: reason });
      db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
      results[id] = { ok: true };
    } catch (e) {
      logger.warn({ err: e.message, sale_id: id }, 'bulk refund item falhou');
      results[id] = { ok: false, error: e.message, code: e.code };
    }
  }

  const summary = Object.values(results).reduce(
    (acc, r) => ({ ok: acc.ok + (r.ok ? 1 : 0), failed: acc.failed + (r.ok ? 0 : 1) }),
    { ok: 0, failed: 0 }
  );
  try {
    require('../services/audit.service').log({
      req, action: 'sale.refund.bulk',
      details: { count: ids.length, ...summary }
    });
  } catch {}
  res.json({ summary, results });
});

// POST /api/checkout/wallet/sale/:id/dispute — marca sale como med_returned
// manualmente (vendedor recebeu contestacao por fora, ex: extrato bancario).
router.post('/sale/:sale_id/dispute', requireAuth, async (req, res) => {
  const sale = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.sale_id);
  if (!sale) return res.status(404).json({ error: 'sale nao encontrada' });
  if (sale.status !== 'paid') return res.status(400).json({ error: 'sale nao esta paga' });
  if (req.guildId && sale.guild_id && sale.guild_id !== req.guildId) {
    return res.status(403).json({ error: 'sale de outra guild' });
  }

  const reason = String(req.body?.reason || 'marcada manualmente como contestada').slice(0, 200);
  try {
    const med = require('../services/med.service');
    const r = await med.handleMedReturn(sale.id, { reason });
    require('../services/audit.service').log({
      req, action: 'sale.dispute_manual',
      target_type: 'sale', target_id: sale.id,
      details: { reason }
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    logger.error({ err: e.message, sale_id: sale.id }, 'dispute manual falhou');
    res.status(500).json({ error: e.message });
  }
});

// GET /api/checkout/wallet/sales.csv — exporta em CSV pra contabilidade
router.get('/sales.csv', requireAuth, (req, res) => {
  const gFilter = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const gArgs   = req.guildId ? [req.guildId] : [];

  const rows = db.prepare(`
    SELECT s.id, s.discord_id, s.discord_tag, s.amount_cents, s.net_to_owner_cents,
           s.status, s.provider, s.provider_charge_id, s.provider_pay_currency,
           s.paid_at, s.created_at, s.guild_id,
           p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.provider IS NOT NULL ${gFilter}
    ORDER BY COALESCE(s.paid_at, s.created_at) DESC
    LIMIT 5000
  `).all(...gArgs);

  const headers = ['id','status','provider','charge_id','pay_currency','amount_brl','net_brl','discord_id','discord_tag','product','created_at','paid_at'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const fmt = v => v == null ? '' : String(v).replace(/"/g, '""');
    const wrap = v => /[,"\n]/.test(String(v ?? '')) ? `"${fmt(v)}"` : fmt(v);
    const created = r.created_at ? new Date(r.created_at * 1000).toISOString() : '';
    const paid    = r.paid_at    ? new Date(r.paid_at    * 1000).toISOString() : '';
    lines.push([
      r.id, r.status, r.provider, r.provider_charge_id || '', r.provider_pay_currency || '',
      (r.amount_cents / 100).toFixed(2),
      ((r.net_to_owner_cents || r.amount_cents) / 100).toFixed(2),
      r.discord_id || '', r.discord_tag || '',
      r.product_name || '', created, paid
    ].map(wrap).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="botdash-sales-${Date.now()}.csv"`);
  res.send(lines.join('\n'));
});

// GET /api/checkout/wallet/sales — lista vendas processadas via Wallet
// (paid / refunded / med_returned) com filtros pra UI de disputa
router.get('/sales', apiKeyOrAuth('read:sales'), (req, res) => {
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
