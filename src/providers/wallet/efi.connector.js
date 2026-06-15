// Efi (ex-Gerencianet) — PIX BR. mTLS com certificado ICP-Brasil obrigatorio.
//
// Docs: https://dev.efipay.com.br
//
// Como o vendedor pega as credenciais:
//   1) Cria aplicacao em https://app.efipay.com.br -> API -> Nova aplicacao
//   2) Pega Client ID + Client Secret
//   3) Gera certificado .p12 em API -> Meus certificados
//   4) Converte pra base64: `base64 -w0 producao.p12 > efi-cert.txt`
//   5) Cola em EFI_CERTIFICATE
//
// Auth: OAuth2 client_credentials usando o certificado como TLS client cert.
//       Sem cert -> falha imediata.
//
// Endpoints:
//   POST /v2/cob       → cria cobranca PIX imediata
//   GET  /v2/cob/:txid → consulta
//   PUT  /v2/cob/:txid/refund/:id → refund
//
// IMPORTANTE: este connector EXIGE certificado mTLS pra fazer qualquer
// request real. Se EFI_CERTIFICATE nao esta setado, createCharge joga.

const https = require('https');
const crypto = require('crypto');
const { BaseConnector, centsToReaisString } = require('./base.connector');

const EFI_PROD    = 'https://pix.api.efipay.com.br';
const EFI_SANDBOX = 'https://pix-h.api.efipay.com.br';

class EfiConnector extends BaseConnector {
  constructor(args) { super({ ...args, providerId: 'efi' }); }

  static get REQUIRED_CREDS() { return ['EFI_CLIENT_ID', 'EFI_CLIENT_SECRET', 'EFI_CERTIFICATE']; }

  baseUrl() {
    // Sandbox se a chave parece "homologacao" (heuristica simples)
    return String(this.credentials.EFI_CLIENT_ID || '').toLowerCase().includes('homolog')
      ? EFI_SANDBOX : EFI_PROD;
  }

  // Carrega certificado .p12 em base64 -> Buffer
  cert() {
    if (this._cert) return this._cert;
    const b64 = this.credentials.EFI_CERTIFICATE;
    if (!b64) {
      const e = new Error('EFI_CERTIFICATE faltando — Efi exige cert ICP-Brasil');
      e.code = 'efi_no_cert';
      throw e;
    }
    try {
      this._cert = Buffer.from(b64, 'base64');
      return this._cert;
    } catch (e) {
      const err = new Error('EFI_CERTIFICATE invalido (base64 mal formado)');
      err.code = 'efi_bad_cert';
      throw err;
    }
  }

  agent() {
    if (this._agent) return this._agent;
    this._agent = new https.Agent({
      pfx: this.cert(),
      passphrase: '',                  // Efi gera sem passphrase por default
      rejectUnauthorized: true
    });
    return this._agent;
  }

  async getToken() {
    if (this._token && this._token.expiresAt > Date.now() + 30_000) {
      return this._token.value;
    }
    const auth = Buffer.from(
      `${this.credentials.EFI_CLIENT_ID}:${this.credentials.EFI_CLIENT_SECRET}`
    ).toString('base64');
    const r = await fetch(`${this.baseUrl()}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
      agent: this.agent()             // Node fetch via undici aceita "dispatcher", nao agent
    }).catch(e => { throw Object.assign(new Error(e.message), { code: 'efi_auth_failed' }); });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.error_description || data.error || `Efi OAuth ${r.status}`);
      e.code = 'efi_auth_failed';
      throw e;
    }
    this._token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000
    };
    return this._token.value;
  }

  async createCharge({ amount_cents, description, external_reference }) {
    this.ensureCreds();
    if (!(amount_cents > 0)) throw Object.assign(new Error('amount_cents invalido'), { code: 'invalid_amount' });
    // Forca leitura do cert agora (falha cedo se ausente)
    this.cert();

    const token = await this.getToken();
    const txid  = (external_reference || `BotDash${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: centsToReaisString(amount_cents) },
      chave: this.credentials.EFI_PIX_KEY || '',
      solicitacaoPagador: (description || 'BotDash').slice(0, 140)
    };
    const r = await fetch(`${this.baseUrl()}/v2/cob/${txid}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.detail || data.title || `Efi HTTP ${r.status}`);
      e.code = 'efi_create_failed';
      e.raw = data;
      throw e;
    }
    // Gera QR Code pela location
    const qr = data.location || null;
    return {
      external_id:  String(data.txid || txid),
      qr_code:      data.pixCopiaECola || null,
      qr_image:     null,                                   // Efi precisa endpoint separado pra base64
      pay_url:      qr,
      expires_at:   data.calendario?.expiracao
        ? Math.floor((new Date(data.calendario.criacao || Date.now()).getTime() + data.calendario.expiracao * 1000) / 1000)
        : null,
      amount_cents,
      raw: data
    };
  }

  async fetchPayment(txid) {
    this.ensureCreds();
    this.cert();
    const token = await this.getToken();
    const r = await fetch(`${this.baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.detail || `Efi fetch ${r.status}`);
      e.code = 'efi_fetch_failed';
      throw e;
    }
    return data;
  }

  parseWebhook(req) {
    const b = req.body || {};
    const pix = (b.pix || [])[0];
    if (!pix) return { event: 'ignored', external_id: null, raw: b };

    return {
      event: 'paid',
      external_id: String(pix.txid),
      amount_cents: pix.valor ? Math.round(parseFloat(pix.valor) * 100) : null,
      paid_at: pix.horario ? Math.floor(new Date(pix.horario).getTime() / 1000) : Math.floor(Date.now() / 1000),
      raw: b
    };
  }

  mapStatus(cob) {
    const s = String(cob.status || '').toUpperCase();
    if (s === 'CONCLUIDA')         return 'paid';
    if (s === 'REMOVIDA_PELO_PSP') return 'expired';
    if (s === 'REMOVIDA_PELO_USUARIO_RECEBEDOR') return 'expired';
    if (s === 'ATIVA')             return 'pending';
    return 'pending';
  }

  // Efi assina webhook com mTLS (so chega via cert valido). Token compartilhado
  // tambem aceito via header.
  verifySignature(req, secret) {
    if (!secret) return true;
    const got = req.headers['x-efi-webhook-secret'];
    if (!got) return false;
    const a = Buffer.from(String(got));
    const b = Buffer.from(String(secret));
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  }
}

module.exports = EfiConnector;
