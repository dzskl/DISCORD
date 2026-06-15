// MercadoPago — PIX via Payments API (PSP brasileira mais popular).
//
// Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
//
// Como o vendedor pega o access token:
//   1) Cria aplicacao em https://www.mercadopago.com.br/developers/panel/app
//   2) Em "Credenciais de producao" → copia o "Access Token" (APP_USR-...)
//
// MP notifica via 2 mecanismos:
//   - IPN (Instant Payment Notification) — querystring com topic=payment&id=...
//   - Webhooks v2 — JSON com { action, data: { id } }
//
// Em ambos, o handler precisa BUSCAR o payment pra ver o status. Implementamos
// os dois. Validacao HMAC: MP envia header `x-signature: ts=...,v1=...` que
// assina o id da notificacao com a chave secreta de webhook (opcional mas
// recomendado — configurar no painel MP).

const crypto = require('crypto');
const { BaseConnector, centsToReaisString } = require('./base.connector');

const MP_API = 'https://api.mercadopago.com';

class MercadoPagoConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'mercadopago' }); }

  static get REQUIRED_CREDS() { return ['MP_ACCESS_TOKEN']; }

  async createCharge({ amount_cents, description, external_reference, payer = {} }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });

    const body = {
      transaction_amount: parseFloat(centsToReaisString(amount_cents)),
      description: description || 'BotDash',
      payment_method_id: 'pix',
      external_reference: external_reference || undefined,
      payer: {
        email: payer.email || `payer-${Date.now()}@botdash.app`,
        first_name: payer.first_name || 'Comprador',
        last_name: payer.last_name || 'Discord'
      }
    };

    const idempotencyKey = crypto.randomUUID();
    const r = await fetch(`${MP_API}/v1/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.message || `MP HTTP ${r.status}`);
      e.code = 'mp_create_failed';
      e.status = r.status;
      e.raw = data;
      throw e;
    }

    const td = data.point_of_interaction?.transaction_data || {};
    return {
      external_id:  String(data.id),
      qr_code:      td.qr_code || null,
      qr_image:     td.qr_code_base64 || null,
      pay_url:      td.ticket_url || null,
      expires_at:   data.date_of_expiration ? Math.floor(new Date(data.date_of_expiration).getTime() / 1000) : null,
      amount_cents,
      raw: data
    };
  }

  // Busca payment pelo id e devolve estado normalizado
  async fetchPayment(paymentId) {
    this.ensureCreds();
    const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { 'Authorization': `Bearer ${this.credentials.MP_ACCESS_TOKEN}` }
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      const e = new Error(data.message || `MP HTTP ${r.status}`);
      e.code = 'mp_fetch_failed';
      throw e;
    }
    return r.json();
  }

  // MP webhook v2: { action, data: { id }, type }
  // MP IPN:        ?topic=payment&id=...
  parseWebhook(req) {
    const body = req.body || {};
    const q = req.query || {};

    // Caso 1: webhook v2 JSON
    const action = body.action || body.type;
    const id = body.data?.id || body.id || q.id || q['data.id'];

    if (!id) {
      return { event: 'ignored', external_id: null, raw: { body, query: q } };
    }

    // O webhook so notifica que algo mudou — precisa fetchPayment pra saber
    // o status final. Quem chama deve fazer:
    //
    //   const parsed = connector.parseWebhook(req);
    //   if (parsed.event !== 'ignored') {
    //     const payment = await connector.fetchPayment(parsed.external_id);
    //     // mapeie payment.status pra paid/expired/refunded
    //   }
    return {
      event: 'pending_fetch',
      external_id: String(id),
      action: action || null,
      raw: { body, query: q }
    };
  }

  // Refund total ou parcial. MP: POST /v1/payments/:id/refunds
  // value (em BRL, reais) opcional — se omitido, refund total.
  async refundPayment(paymentId, { value, description } = {}) {
    this.ensureCreds();
    const body = value != null ? { amount: parseFloat(centsToReaisString(value)) } : {};
    const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.message || `MP refund HTTP ${r.status}`);
      e.code = 'mp_refund_failed';
      e.raw = data;
      throw e;
    }
    return data;
  }

  // Mapeia status do MP pra evento canonico (chamado apos fetchPayment)
  mapStatus(payment) {
    const s = payment.status;
    if (s === 'approved')   return 'paid';
    if (s === 'refunded') {
      // refund pode ser manual ou MED (dispute). Refunds list disponivel
      // em payment.refunds — se algum tem reason='disputa' / status='approved'
      // vindo de chargeback, eh MED.
      const refunds = payment.refunds || [];
      const isDispute = refunds.some(r => {
        const reason = String(r.reason || r.refund_mode || '').toLowerCase();
        return reason.includes('disput') || reason.includes('chargeback') || reason.includes('med');
      });
      return isDispute ? 'med_returned' : 'refunded';
    }
    if (s === 'charged_back') return 'med_returned';  // chargeback explicito
    if (s === 'cancelled')  return 'expired';
    if (s === 'rejected')   return 'expired';
    if (s === 'pending' || s === 'in_process' || s === 'authorized') return 'pending';
    return 'ignored';
  }

  // Validacao opcional do header x-signature (se configurado no painel MP)
  verifySignature(req, secret) {
    if (!secret) return true;   // sem secret = aceita (modo lax)
    const sig = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    if (!sig || !requestId) return false;

    const parts = Object.fromEntries(
      String(sig).split(',').map(p => p.trim().split('=').map(x => x.trim()))
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    const dataId = req.body?.data?.id || req.query?.id || req.query?.['data.id'];
    if (!dataId) return false;

    const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(template).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
    } catch { return false; }
  }
}

module.exports = MercadoPagoConnector;
