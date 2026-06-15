// Stripe — cartao internacional (e PIX BR via Payment Methods).
//
// Modelo: Checkout Sessions (hosted checkout), nao Payment Intents. Eh o
// mais simples e estavel pra MVP. O cliente eh redirecionado pra URL do
// Stripe e volta apos pagar.
//
// Docs: https://stripe.com/docs/api/checkout/sessions
//
// Webhook events relevantes:
//   - checkout.session.completed  -> paid
//   - charge.refunded             -> refunded
//   - checkout.session.expired    -> expired
//
// HMAC: Stripe assina cada webhook com header `Stripe-Signature` no formato
//   `t=<timestamp>,v1=<hmac>`. Validacao via `stripe.webhooks.constructEvent`
//   precisa do raw body — feito no controller que monta esse connector.

const { BaseConnector, centsToReaisString } = require('./base.connector');

class StripeConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'stripe' }); }

  static get REQUIRED_CREDS() { return ['STRIPE_SECRET_KEY']; }

  stripe() {
    if (!this._stripe) this._stripe = require('stripe')(this.credentials.STRIPE_SECRET_KEY);
    return this._stripe;
  }

  // Cria Checkout Session com hosted page. amount em centavos BRL.
  async createCharge({
    amount_cents,
    description,
    external_reference,
    success_url,
    cancel_url
  }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    const baseUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    const successDefault = baseUrl ? `${baseUrl}/loja.html?status=ok` : success_url || '';
    const cancelDefault  = baseUrl ? `${baseUrl}/loja.html?status=cancel` : cancel_url || '';

    try {
      const session = await this.stripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'brl',
            product_data: { name: description || 'BotDash' },
            unit_amount: amount_cents
          },
          quantity: 1
        }],
        client_reference_id: external_reference || undefined,
        success_url: success_url || successDefault,
        cancel_url:  cancel_url  || cancelDefault,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 3600
      });

      return {
        external_id:  session.id,
        qr_code:      null,
        qr_image:     null,
        pay_url:      session.url,
        expires_at:   session.expires_at || null,
        amount_cents,
        raw: session
      };
    } catch (e) {
      const err = new Error(e.message || 'Stripe create failed');
      err.code = 'stripe_create_failed';
      err.raw = e;
      throw err;
    }
  }

  async fetchPayment(sessionId) {
    this.ensureCreds();
    try {
      return await this.stripe().checkout.sessions.retrieve(sessionId);
    } catch (e) {
      const err = new Error(e.message || 'Stripe fetch failed');
      err.code = 'stripe_fetch_failed';
      throw err;
    }
  }

  async refundPayment(sessionId, { value, description } = {}) {
    this.ensureCreds();
    try {
      const session = await this.stripe().checkout.sessions.retrieve(sessionId);
      if (!session.payment_intent) throw new Error('sem payment_intent');
      const body = { payment_intent: session.payment_intent };
      if (value != null) body.amount = Math.round(value);
      if (description)   body.reason = 'requested_by_customer';
      return await this.stripe().refunds.create(body);
    } catch (e) {
      const err = new Error(e.message || 'Stripe refund failed');
      err.code = 'stripe_refund_failed';
      throw err;
    }
  }

  // GET /v1/account — Stripe Account API
  async testConnection() {
    this.ensureCreds();
    try {
      const acc = await this.stripe().accounts.retrieve();
      return {
        ok: true,
        account: {
          id: acc.id, email: acc.email, country: acc.country,
          currency: acc.default_currency, charges_enabled: acc.charges_enabled
        }
      };
    } catch (e) {
      const err = new Error(e.message || 'Stripe test failed');
      err.code = 'stripe_test_failed';
      throw err;
    }
  }

  // Webhook handler. Stripe ja parseia o tipo do evento.
  parseWebhook(req) {
    const event = req.body || {};
    const t = event.type;
    if (!t) return { event: 'ignored', external_id: null, raw: event };

    if (t === 'checkout.session.completed') {
      const s = event.data?.object || {};
      return {
        event: 'paid',
        external_id: s.id || null,
        amount_cents: typeof s.amount_total === 'number' ? s.amount_total : null,
        paid_at: Math.floor(Date.now() / 1000),
        raw: event
      };
    }
    if (t === 'checkout.session.expired') {
      const s = event.data?.object || {};
      return { event: 'expired', external_id: s.id || null, raw: event };
    }
    if (t === 'charge.refunded') {
      const c = event.data?.object || {};
      return {
        event: 'refunded',
        external_id: c.payment_intent || c.id || null,
        amount_cents: typeof c.amount_refunded === 'number' ? c.amount_refunded : null,
        raw: event
      };
    }
    return { event: 'ignored', external_id: null, raw: event };
  }

  mapStatus(session) {
    const s = String(session.payment_status || session.status || '').toLowerCase();
    if (s === 'paid' || s === 'complete') return 'paid';
    if (s === 'expired')                  return 'expired';
    if (s === 'unpaid' || s === 'open')   return 'pending';
    return 'pending';
  }

  // Stripe verifica HMAC com `constructEvent`. Mas isso precisa do raw body.
  // Por padrao recebemos JSON ja parseado. Pra preservar o body raw, o
  // wallet-webhook controller precisa rotear Stripe por uma rota dedicada
  // que use express.raw(). Por enquanto, modo lax (true se secret missing).
  verifySignature(req, secret) {
    if (!secret) return true;
    const sig = req.headers['stripe-signature'];
    if (!sig) return false;
    const rawBody = req.rawBody;          // setado por middleware express.raw
    if (!rawBody) {
      // Sem raw body nao da pra validar — rejeita pra forcar setup correto
      return false;
    }
    try {
      this.stripe().webhooks.constructEvent(rawBody, sig, secret);
      return true;
    } catch { return false; }
  }
}

module.exports = StripeConnector;
