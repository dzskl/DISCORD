// Webhook unificado pros providers do wallet.
//
// POST /webhooks/wallet/:provider
//   - Valida HMAC se o vendedor configurou um secret no header
//   - parseWebhook do connector → evento canonico
//   - Se 'pending_fetch' (MP/PushinPay com payload minimo) → fetchPayment
//     e mapeia status pro evento real
//   - Se 'paid' → fulfillment.fulfillSale(sale_id)
//   - Registra em webhook_events pra auditoria + idempotencia
//
// Idempotente: (provider, external_id) UNIQUE, processamento dupla eh no-op.

const express = require('express');
const router = express.Router();
const { db, getCredential } = require('../database/connection');
const registry = require('../providers/wallet');
const wallet = require('../config/wallet-providers');
const { fulfillSale } = require('../services/fulfillment.service');
const logger = require('../utils/logger');

// Mapeamento de HMAC secrets por provider (chave no banco de credentials)
const HMAC_SECRET_KEY = {
  mercadopago: 'MP_WEBHOOK_SECRET',
  pushinpay:   'PUSHINPAY_WEBHOOK_SECRET',
  nowpayments: 'NOWPAYMENTS_IPN_SECRET',
  asaas:       'ASAAS_WEBHOOK_TOKEN',
  abacatepay:  'ABACATE_WEBHOOK_SECRET',
  stripe:      'STRIPE_WEBHOOK_SECRET',
  misticpay:   'MISTICPAY_WEBHOOK_SECRET',
  efi:         'EFI_WEBHOOK_SECRET'
};

// Body parser dinamico: Stripe assina raw body, os outros aceitam JSON.
// Pra Stripe: express.raw + JSON.parse manual + req.rawBody pra verifySignature.
const stripeRaw = express.raw({ type: 'application/json', limit: '256kb' });
const jsonParser = express.json({ limit: '256kb' });

function bodyParser(req, res, next) {
  if (req.params.provider === 'stripe') {
    return stripeRaw(req, res, () => {
      req.rawBody = req.body;
      try { req.body = JSON.parse(req.body.toString('utf8') || '{}'); }
      catch { req.body = {}; }
      next();
    });
  }
  return jsonParser(req, res, next);
}

router.post('/:provider', bodyParser, async (req, res) => {
  const provider = req.params.provider;
  if (!registry.isSupported(provider)) return res.status(404).json({ error: 'provider desconhecido' });

  let connector;
  try { connector = registry.instantiate(provider); }
  catch (e) { return res.status(503).json({ error: 'provider nao configurado', code: e.code }); }

  // 1. Valida HMAC (opcional — secret pode nao estar configurado)
  const secret = getCredential(HMAC_SECRET_KEY[provider]);
  const sigOk = connector.verifySignature(req, secret);
  if (secret && !sigOk) {
    logger.warn({ provider, headers: req.headers }, 'webhook HMAC invalido');
    return res.status(401).json({ error: 'assinatura invalida' });
  }

  // 2. Parse
  let parsed;
  try { parsed = connector.parseWebhook(req); }
  catch (e) {
    logger.warn({ err: e.message, provider }, 'parseWebhook falhou');
    return res.status(400).json({ error: 'payload invalido' });
  }

  // Metricas: webhook recebido
  try { require('../services/metrics.service').inc('botdash_webhook_received_total', { gateway: provider, status: parsed.event }); } catch {}

  // 3. Registra evento (auditoria + idempotencia)
  const eventId = `${provider}:${parsed.external_id || 'no-id'}:${Math.floor(Date.now() / 1000)}`;
  let webhookEventId = null;
  try {
    const r = db.prepare(`
      INSERT OR IGNORE INTO webhook_events (gateway, event_id, event_type, transaction_id, payload, signature_ok, status)
      VALUES (?,?,?,?,?,?, 'received')
    `).run(provider, eventId, parsed.event, parsed.external_id || null, JSON.stringify(req.body || {}), sigOk ? 1 : 0);
    webhookEventId = r.lastInsertRowid;
  } catch (e) { logger.warn({ err: e.message }, 'webhook_events insert falhou'); }

  // 4. Eventos que nao precisam de acao
  if (parsed.event === 'ignored') {
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (!parsed.external_id) {
    return res.status(200).json({ ok: true, no_id: true });
  }

  // 5. Localiza sale pelo (provider, charge_id)
  const sale = db.prepare(`SELECT * FROM sales WHERE provider=? AND provider_charge_id=?`).get(provider, parsed.external_id);
  if (!sale) {
    logger.warn({ provider, external_id: parsed.external_id }, 'sale nao encontrada pro webhook');
    return res.status(200).json({ ok: true, sale_not_found: true });
  }

  // 6. Se evento eh "pending_fetch" (MP/PushinPay so manda id), busca status na PSP
  let event = parsed.event;
  if (event === 'pending_fetch') {
    try {
      const payment = await connector.fetchPayment(parsed.external_id);
      if (connector.mapStatus) event = connector.mapStatus(payment);
      else {
        const s = String(payment.status || payment.payment_status || '').toLowerCase();
        if (s === 'paid' || s === 'approved' || s === 'finished' || s === 'confirmed') event = 'paid';
        else if (s === 'expired' || s === 'cancelled' || s === 'failed') event = 'expired';
        else if (s === 'refunded') event = 'refunded';
        else event = 'pending';
      }
    } catch (e) {
      logger.warn({ err: e.message, provider, external_id: parsed.external_id }, 'fetchPayment falhou');
      return res.status(200).json({ ok: true, fetch_failed: true });
    }
  }

  // 7. Executa acao
  if (event === 'paid') {
    if (sale.status === 'paid') {
      // Ja processada — webhook duplicado, ok
      markEventStatus(webhookEventId, 'duplicate', sale.id);
      return res.status(200).json({ ok: true, duplicate: true });
    }
    try {
      const result = await fulfillSale(sale.id, { metadata: { discord_id: sale.discord_id }, parentSpan: req.span });
      markEventStatus(webhookEventId, result.ok ? 'processed' : 'failed', sale.id, result.error);
      return res.status(200).json({ ok: !!result.ok });
    } catch (e) {
      logger.error({ err: e.message, sale_id: sale.id }, 'fulfillSale jogou');
      markEventStatus(webhookEventId, 'failed', sale.id, e.message);
      return res.status(500).json({ error: 'fulfillment falhou' });
    }
  }

  if (event === 'expired') {
    if (sale.status === 'pending') {
      db.prepare(`UPDATE sales SET status='expired' WHERE id=?`).run(sale.id);
    }
    markEventStatus(webhookEventId, 'processed', sale.id);
    return res.status(200).json({ ok: true, expired: true });
  }

  if (event === 'refunded') {
    db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
    markEventStatus(webhookEventId, 'processed', sale.id);
    return res.status(200).json({ ok: true, refunded: true });
  }

  if (event === 'med_returned') {
    try {
      const med = require('../services/med.service');
      const r = await med.handleMedReturn(sale.id, { reason: parsed.reason });
      markEventStatus(webhookEventId, 'processed', sale.id);
      return res.status(200).json({ ok: true, med_returned: true, already: !!r.already_processed });
    } catch (e) {
      logger.error({ err: e.message, sale_id: sale.id }, 'med handler falhou');
      markEventStatus(webhookEventId, 'failed', sale.id, e.message);
      return res.status(500).json({ error: 'med falhou' });
    }
  }

  // pending / partial — registra mas nao age
  markEventStatus(webhookEventId, 'processed', sale.id);
  res.status(200).json({ ok: true, event });
});

function markEventStatus(id, status, saleId, error) {
  if (!id) return;
  try {
    db.prepare(`UPDATE webhook_events SET status=?, sale_id=?, error=?, processed_at=strftime('%s','now') WHERE id=?`)
      .run(status, saleId || null, error || null, id);
  } catch {}
}

module.exports = router;
