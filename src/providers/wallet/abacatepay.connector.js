// AbacatePay — PIX BR, simples (foco no nicho de bots/digital).
//
// Docs: https://docs.abacatepay.com
//
// Como o vendedor pega a API key:
//   1) Cria conta em https://abacatepay.com
//   2) Em "API" → copia o token (Bearer)
//
// Endpoints (v1):
//   POST /v1/pixQrCode/create        → cria QR PIX
//   GET  /v1/pixQrCode/check?id=...  → consulta
//
// Webhook: { event, data: { id, status, ... } }. Validacao via header
// `webhookSecret` (string compartilhada).

const crypto = require('crypto');
const { BaseConnector } = require('./base.connector');

const ABACATE_API = 'https://api.abacatepay.com';

class AbacatePayConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'abacatepay' }); }

  static get REQUIRED_CREDS() { return ['ABACATE_API_KEY']; }

  async createCharge({ amount_cents, description, external_reference, expires_in_minutes = 60 }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    const body = {
      amount: amount_cents,           // AbacatePay aceita em centavos
      expiresIn: expires_in_minutes * 60,
      description: description || 'BotDash',
      externalId: external_reference || undefined
    };
    const data = await this.api('POST', '/v1/pixQrCode/create', body);
    const d = data.data || data;

    return {
      external_id:  String(d.id),
      qr_code:      d.brCode || d.copyPaste || null,
      qr_image:     d.brCodeBase64 || null,
      pay_url:      null,
      expires_at:   d.expiresAt ? Math.floor(new Date(d.expiresAt).getTime() / 1000) : null,
      amount_cents,
      raw: data
    };
  }

  async fetchPayment(id) {
    this.ensureCreds();
    return this.api('GET', `/v1/pixQrCode/check?id=${encodeURIComponent(id)}`);
  }

  async testConnection() {
    this.ensureCreds();
    const r = await fetch(`${ABACATE_API}/v1/billing/list`, {
      headers: { 'Authorization': `Bearer ${this.credentials.ABACATE_API_KEY}`, 'Accept': 'application/json' }
    });
    if (r.status === 401 || r.status === 403) {
      const e = new Error('API key invalida'); e.code = 'abacate_test_failed'; throw e;
    }
    return { ok: true };
  }

  parseWebhook(req) {
    const b = req.body || {};
    const d = b.data || {};
    const id = d.id || b.id;
    if (!id) return { event: 'ignored', external_id: null, raw: b };

    const status = String(d.status || b.status || '').toUpperCase();
    let event = 'pending_fetch';
    let paid_at = null;
    if (status === 'PAID') {
      event = 'paid';
      paid_at = d.paidAt ? Math.floor(new Date(d.paidAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    } else if (status === 'EXPIRED' || status === 'CANCELLED') {
      event = 'expired';
    } else if (status === 'REFUNDED') {
      event = 'refunded';
    }

    return {
      event,
      external_id: String(id),
      amount_cents: typeof d.amount === 'number' ? d.amount : null,
      paid_at,
      raw: b
    };
  }

  mapStatus(payment) {
    const d = payment.data || payment;
    const s = String(d.status || '').toUpperCase();
    if (s === 'PAID')      return 'paid';
    if (s === 'REFUNDED')  return 'refunded';
    if (s === 'EXPIRED' || s === 'CANCELLED') return 'expired';
    return 'pending';
  }

  verifySignature(req, secret) {
    if (!secret) return true;
    const got = req.headers['x-abacate-webhook-secret'] || req.headers['webhooksecret'];
    if (!got) return false;
    const a = Buffer.from(String(got));
    const b = Buffer.from(String(secret));
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  }

  async api(method, path, body) {
    const r = await fetch(`${ABACATE_API}${path}`, {
      method,
      headers: {
        'Authorization':  `Bearer ${this.credentials.ABACATE_API_KEY}`,
        'Content-Type':   'application/json',
        'Accept':         'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.message || `AbacatePay HTTP ${r.status}`);
      e.code = 'abacate_api_failed';
      e.status = r.status;
      e.raw = data;
      throw e;
    }
    return data;
  }
}

module.exports = AbacatePayConnector;
