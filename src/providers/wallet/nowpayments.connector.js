// NOWPayments — cripto (non-custodial recomendado).
//
// Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
//
// Como o vendedor pega as credenciais:
//   1) Cria conta em https://nowpayments.io
//   2) Em "Store Settings" → API Key (x-api-key)
//   3) Em "Store Settings" → IPN Secret Key
//   4) Cadastra wallet de recebimento por moeda (USDT TRC-20, BTC, etc.)
//
// Modo non-custodial: NOWPayments encaminha direto pra wallet do vendedor.
// Modo custodial: fica na NOWPayments ate withdraw (mais cobrancas).
//
// Endpoints usados:
//   POST /v1/payment       → cria invoice/payment
//   GET  /v1/payment/:id   → consulta estado
//
// Webhook (IPN):
//   POST com JSON; header `x-nowpayments-sig` = HMAC-SHA512(IPN_SECRET, sorted_json)

const crypto = require('crypto');
const { BaseConnector, centsToReaisString } = require('./base.connector');

const NOW_API = 'https://api.nowpayments.io';

class NOWPaymentsConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'nowpayments' }); }

  static get REQUIRED_CREDS() { return ['NOWPAYMENTS_API_KEY']; }

  // amount em BRL (centavos); pay_currency define a moeda cripto.
  // NOWPayments converte BRL→cripto na cotacao do momento.
  async createCharge({
    amount_cents,
    pay_currency = 'usdttrc20',
    order_id,
    order_description,
    ipn_callback_url
  }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    const body = {
      price_amount: parseFloat(centsToReaisString(amount_cents)),
      price_currency: 'brl',
      pay_currency,
      order_id: order_id || `botdash-${Date.now()}`,
      order_description: order_description || 'BotDash',
      ipn_callback_url: ipn_callback_url || undefined,
      is_fixed_rate: true,           // congela cotacao por 15min
      is_fee_paid_by_user: false
    };

    const r = await fetch(`${NOW_API}/v1/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': this.credentials.NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.message || `NOWPayments HTTP ${r.status}`);
      e.code = 'now_create_failed';
      e.status = r.status;
      e.raw = data;
      throw e;
    }

    return {
      external_id:  String(data.payment_id),
      qr_code:      data.pay_address || null,
      qr_image:     null,
      pay_url:      data.invoice_url || null,
      expires_at:   data.expiration_estimate_date ? Math.floor(new Date(data.expiration_estimate_date).getTime() / 1000) : null,
      amount_cents,
      pay_currency,
      pay_amount:   data.pay_amount,        // valor em cripto
      raw: data
    };
  }

  async fetchPayment(paymentId) {
    this.ensureCreds();
    const r = await fetch(`${NOW_API}/v1/payment/${encodeURIComponent(paymentId)}`, {
      headers: { 'x-api-key': this.credentials.NOWPAYMENTS_API_KEY }
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      const e = new Error(data.message || `NOWPayments HTTP ${r.status}`);
      e.code = 'now_fetch_failed';
      throw e;
    }
    return r.json();
  }

  // GET /v1/status — endpoint publico mas valida que a API key existe
  async testConnection() {
    this.ensureCreds();
    const r = await fetch(`${NOW_API}/v1/auth/me`, {
      headers: { 'x-api-key': this.credentials.NOWPAYMENTS_API_KEY }
    });
    if (r.status === 401 || r.status === 403) {
      const e = new Error('API key invalida'); e.code = 'now_test_failed'; throw e;
    }
    const data = await r.json().catch(() => ({}));
    return { ok: true, account: data };
  }

  parseWebhook(req) {
    const b = req.body || {};
    const id = b.payment_id;
    if (!id) return { event: 'ignored', external_id: null, raw: b };

    const status = String(b.payment_status || '').toLowerCase();
    let event = 'pending_fetch';
    let paid_at = null;
    if (status === 'finished' || status === 'confirmed') {
      event = 'paid';
      paid_at = b.updated_at ? Math.floor(new Date(b.updated_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
    } else if (status === 'expired' || status === 'failed') {
      event = 'expired';
    } else if (status === 'refunded') {
      event = 'refunded';
    } else if (status === 'partially_paid') {
      event = 'partial';
    }

    return {
      event,
      external_id: String(id),
      amount_cents: null,            // valor em BRL fica congelado no intent
      paid_at,
      raw: b
    };
  }

  // IPN: HMAC-SHA512 do body JSON com chaves ORDENADAS alfabeticamente.
  // O header esperado eh `x-nowpayments-sig`.
  verifySignature(req, secret) {
    if (!secret) return true;     // permissivo se nao configurar
    const got = req.headers['x-nowpayments-sig'];
    if (!got || !req.body) return false;

    const sorted = sortObjectKeys(req.body);
    const expected = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(sorted))
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(got), 'hex'));
    } catch { return false; }
  }
}

function sortObjectKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = sortObjectKeys(obj[k]);
      return acc;
    }, {});
  }
  return obj;
}

module.exports = NOWPaymentsConnector;
