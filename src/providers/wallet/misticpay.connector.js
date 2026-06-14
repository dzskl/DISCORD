// MisticPay — PSP brasileiro PIX. Refator pro padrao Wallet (usa o
// service legado src/services/misticpay.service.js por baixo).
//
// Webhook: { transactionId, status, ... }. Validacao HMAC opcional via
// header `x-misticpay-signature`.

const crypto = require('crypto');
const { BaseConnector } = require('./base.connector');

class MisticPayConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'misticpay' }); }

  static get REQUIRED_CREDS() { return ['MISTICPAY_CLIENT_ID', 'MISTICPAY_CLIENT_SECRET']; }

  // O service legado le credenciais do banco diretamente — funciona porque
  // este connector instanciado tem as mesmas creds em memoria. Mantemos a
  // dependencia indireta pra evitar duplicar logica do MisticPay.
  service() { return require('../../services/misticpay.service'); }

  async createCharge({ amount_cents, description, external_reference }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    try {
      const r = await this.service().createPixTransaction({
        amount_cents,
        payerName: 'Cliente BotDash',
        payerDocument: '00000000000',
        transactionId: external_reference || `botdash-${Date.now()}`,
        description: description || 'BotDash'
      });

      return {
        external_id:  String(r.transactionId || r.id),
        qr_code:      r.copy_paste || r.copyPaste || null,
        qr_image:     r.qr_code_base64 || r.qrCodeBase64 || null,
        pay_url:      null,
        expires_at:   r.expires_at ? Math.floor(new Date(r.expires_at).getTime() / 1000) : null,
        amount_cents,
        raw: r
      };
    } catch (e) {
      const err = new Error(e.message || 'MisticPay create failed');
      err.code = 'misticpay_create_failed';
      throw err;
    }
  }

  async fetchPayment(id) {
    this.ensureCreds();
    try {
      return await this.service().getTransaction(id);
    } catch (e) {
      const err = new Error(e.message || 'MisticPay fetch failed');
      err.code = 'misticpay_fetch_failed';
      throw err;
    }
  }

  parseWebhook(req) {
    const b = req.body || {};
    const id = b.transactionId || b.transaction_id || b.id;
    if (!id) return { event: 'ignored', external_id: null, raw: b };

    const status = String(b.status || '').toLowerCase();
    let event = 'pending_fetch';
    let paid_at = null;
    if (status === 'paid' || status === 'approved' || status === 'completed') {
      event = 'paid';
      paid_at = b.paid_at ? Math.floor(new Date(b.paid_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
    } else if (status === 'expired' || status === 'cancelled') {
      event = 'expired';
    } else if (status === 'refunded') {
      event = 'refunded';
    }

    return {
      event,
      external_id: String(id),
      amount_cents: typeof b.amount_cents === 'number' ? b.amount_cents : null,
      paid_at,
      raw: b
    };
  }

  mapStatus(p) {
    const s = String(p.status || '').toLowerCase();
    if (s === 'paid' || s === 'approved' || s === 'completed') return 'paid';
    if (s === 'expired' || s === 'cancelled')                  return 'expired';
    if (s === 'refunded')                                       return 'refunded';
    return 'pending';
  }

  verifySignature(req, secret) {
    if (!secret) return true;
    const got = req.headers['x-misticpay-signature'] || req.headers['x-webhook-signature'];
    if (!got) return false;
    // Assina o transactionId + status com HMAC-SHA256
    const id = req.body?.transactionId || req.body?.id || '';
    const status = req.body?.status || '';
    const expected = crypto.createHmac('sha256', secret).update(`${id}:${status}`).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(got), 'hex'));
    } catch { return false; }
  }
}

module.exports = MisticPayConnector;
