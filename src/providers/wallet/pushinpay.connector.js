// PushinPay — PSP brasileira nicho Discord/digital, PIX-only.
//
// Docs: https://docs.pushinpay.com.br
//
// Como o vendedor pega o token:
//   1) Cria conta em https://pushinpay.com.br
//   2) Em "API" → copia o token (Bearer)
//
// Endpoints:
//   POST /api/pix/cashIn    → cria cobranca
//   GET  /api/transactions/:id → consulta estado
//
// Webhook:
//   PushinPay manda POST com { id, status, value, payer_name, ... }
//   Sem HMAC oficial — recomendamos usar X-PushinPay-Webhook-Secret (header
//   configurado pelo proprio vendedor no painel PushinPay).

const crypto = require('crypto');
const { BaseConnector } = require('./base.connector');

const PUSHIN_API = 'https://api.pushinpay.com.br';

class PushinPayConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'pushinpay' }); }

  static get REQUIRED_CREDS() { return ['PUSHINPAY_TOKEN']; }

  async createCharge({ amount_cents, webhook_url, external_reference }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    const body = {
      value: amount_cents,           // PushinPay aceita em centavos
      webhook_url: webhook_url || undefined,
      external_id: external_reference || undefined
    };

    const r = await fetch(`${PUSHIN_API}/api/pix/cashIn`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.PUSHINPAY_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.message || data.error || `PushinPay HTTP ${r.status}`);
      e.code = 'pushin_create_failed';
      e.status = r.status;
      e.raw = data;
      throw e;
    }

    return {
      external_id:  String(data.id),
      qr_code:      data.qr_code || data.copy_paste || null,
      qr_image:     data.qr_code_base64 || null,
      pay_url:      null,
      expires_at:   data.expires_at ? Math.floor(new Date(data.expires_at).getTime() / 1000) : null,
      amount_cents,
      raw: data
    };
  }

  async fetchPayment(id) {
    this.ensureCreds();
    const r = await fetch(`${PUSHIN_API}/api/transactions/${encodeURIComponent(id)}`, {
      headers: {
        'Authorization': `Bearer ${this.credentials.PUSHINPAY_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      const e = new Error(data.message || `PushinPay HTTP ${r.status}`);
      e.code = 'pushin_fetch_failed';
      throw e;
    }
    return r.json();
  }

  parseWebhook(req) {
    const b = req.body || {};
    const id = b.id || b.transaction_id;
    if (!id) return { event: 'ignored', external_id: null, raw: b };

    const status = String(b.status || '').toLowerCase();
    let event = 'pending_fetch';
    let paid_at = null;
    if (status === 'paid' || status === 'approved') {
      event = 'paid';
      paid_at = b.paid_at ? Math.floor(new Date(b.paid_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
    } else if (status === 'expired' || status === 'cancelled' || status === 'canceled') {
      event = 'expired';
    } else if (status === 'refunded' || status === 'chargeback') {
      event = 'refunded';
    }

    return {
      event,
      external_id: String(id),
      amount_cents: typeof b.value === 'number' ? b.value : null,
      paid_at,
      raw: b
    };
  }

  // PushinPay nao expoe HMAC nativo. Usamos secret compartilhado no header
  // X-PushinPay-Webhook-Secret (vendedor define igual nos dois lados).
  verifySignature(req, secret) {
    if (!secret) return true;
    const got = req.headers['x-pushinpay-webhook-secret'] || req.headers['x-webhook-secret'];
    if (!got) return false;
    const a = Buffer.from(String(got));
    const b = Buffer.from(String(secret));
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  }
}

module.exports = PushinPayConnector;
