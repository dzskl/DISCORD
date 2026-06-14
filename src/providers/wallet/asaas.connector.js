// Asaas — PIX-only nesse MVP. Refund nativo via API.
//
// Docs: https://docs.asaas.com
//
// Como o vendedor pega a API key:
//   1) Cria conta em https://www.asaas.com
//   2) Em "Integracoes > API > Chaves de API" → Gera nova chave
//
// Endpoints:
//   POST /v3/payments     → cria cobranca (billingType=PIX)
//   GET  /v3/payments/:id → consulta
//   POST /v3/payments/:id/refund → refund total/parcial
//
// Webhook: POST com { event, payment: {...} }. Sem HMAC nativo — Asaas
// recomenda configurar `access_token` query string que o vendedor define
// no painel. Nos validamos via ASAAS_WEBHOOK_TOKEN.

const crypto = require('crypto');
const { BaseConnector, centsToReaisString } = require('./base.connector');

const ASAAS_PROD    = 'https://api.asaas.com';
const ASAAS_SANDBOX = 'https://api-sandbox.asaas.com';

class AsaasConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'asaas' }); }

  static get REQUIRED_CREDS() { return ['ASAAS_API_KEY']; }

  baseUrl() {
    return String(this.credentials.ASAAS_API_KEY || '').startsWith('$aact_YTU5')
      ? ASAAS_SANDBOX
      : ASAAS_PROD;
  }

  async createCharge({ amount_cents, description, external_reference, payer = {} }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    // Asaas precisa de um customer; criamos um one-shot por cpfCnpj se fornecido,
    // ou usamos o "comprador anonimo" via name + cpfCnpj fake (para MVP, exige CPF
    // — em producao, integrar com etapa de KYC do checkout).
    let customerId = payer.customer_id;
    if (!customerId) {
      const c = await this.api('POST', '/v3/customers', {
        name:     payer.name     || 'Comprador BotDash',
        email:    payer.email    || `payer-${Date.now()}@botdash.app`,
        cpfCnpj:  payer.cpf      || undefined
      });
      customerId = c.id;
    }

    const dueDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const body = {
      customer:        customerId,
      billingType:     'PIX',
      value:           parseFloat(centsToReaisString(amount_cents)),
      dueDate,
      description:     description || 'BotDash',
      externalReference: external_reference || undefined
    };
    const data = await this.api('POST', '/v3/payments', body);

    // Pega QR code (Asaas tem endpoint dedicado)
    const qr = await this.api('GET', `/v3/payments/${data.id}/pixQrCode`).catch(() => ({}));
    return {
      external_id:  String(data.id),
      qr_code:      qr.payload || null,
      qr_image:     qr.encodedImage || null,
      pay_url:      data.invoiceUrl || null,
      expires_at:   qr.expirationDate ? Math.floor(new Date(qr.expirationDate).getTime() / 1000) : null,
      amount_cents,
      raw: { payment: data, qr }
    };
  }

  async fetchPayment(id) {
    this.ensureCreds();
    return this.api('GET', `/v3/payments/${encodeURIComponent(id)}`);
  }

  async refundPayment(id, { value, description } = {}) {
    this.ensureCreds();
    const body = {};
    if (value != null) body.value = parseFloat(centsToReaisString(value));
    if (description)   body.description = description;
    return this.api('POST', `/v3/payments/${encodeURIComponent(id)}/refund`, body);
  }

  parseWebhook(req) {
    const b = req.body || {};
    const id = b.payment?.id;
    if (!id) return { event: 'ignored', external_id: null, raw: b };

    const evt = String(b.event || '').toUpperCase();
    let event = 'pending_fetch';
    let paid_at = null;
    let reason = null;
    if (evt === 'PAYMENT_CONFIRMED' || evt === 'PAYMENT_RECEIVED') {
      event = 'paid';
      paid_at = b.payment.paymentDate
        ? Math.floor(new Date(b.payment.paymentDate).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
    } else if (evt === 'PAYMENT_OVERDUE' || evt === 'PAYMENT_DELETED') {
      event = 'expired';
    } else if (evt === 'PAYMENT_CHARGEBACK_REQUESTED' || evt === 'PAYMENT_CHARGEBACK_DISPUTE' || evt === 'PAYMENT_REFUND_IN_PROGRESS') {
      event = 'med_returned';
      reason = `Asaas ${evt}`;
    } else if (evt === 'PAYMENT_REFUNDED') {
      event = 'refunded';
    }

    return {
      event,
      external_id: String(id),
      amount_cents: typeof b.payment.value === 'number' ? Math.round(b.payment.value * 100) : null,
      paid_at,
      reason,
      raw: b
    };
  }

  mapStatus(payment) {
    const s = String(payment.status || '').toUpperCase();
    if (s === 'CONFIRMED' || s === 'RECEIVED' || s === 'RECEIVED_IN_CASH') return 'paid';
    if (s === 'REFUNDED' || s === 'REFUND_REQUESTED')                     return 'refunded';
    if (s === 'OVERDUE' || s === 'DELETED')                                return 'expired';
    return 'pending';
  }

  // Validacao via token compartilhado (Asaas envia em query `?access_token=` OR
  // header `asaas-access-token`).
  verifySignature(req, secret) {
    if (!secret) return true;
    const got = req.headers['asaas-access-token'] || req.query?.access_token;
    if (!got) return false;
    const a = Buffer.from(String(got));
    const b = Buffer.from(String(secret));
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  }

  async api(method, path, body) {
    const r = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: {
        'access_token':  this.credentials.ASAAS_API_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'User-Agent':    'BotDash'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.errors?.[0]?.description || data.message || `Asaas HTTP ${r.status}`);
      e.code = 'asaas_api_failed';
      e.status = r.status;
      e.raw = data;
      throw e;
    }
    return data;
  }
}

module.exports = AsaasConnector;
