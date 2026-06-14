// Interface comum dos connectors de PSP.
//
// Cada PSP (MercadoPago, PushinPay, NOWPayments, etc.) implementa essa
// interface. O checkout chama metodos sem saber qual PSP esta por baixo.
//
// Contratos:
//
//   createCharge(args) → {
//     external_id:  string,         // id da cobranca na PSP
//     qr_code:      string|null,    // PIX copia-e-cola OU endereco cripto
//     qr_image:     string|null,    // base64 (image/png) opcional
//     pay_url:      string|null,    // URL hosted-checkout (Stripe etc)
//     expires_at:   number|null,    // unix ts
//     amount_cents: number,         // ecoa o valor solicitado em BRL
//     raw:          object          // resposta crua da PSP (debug)
//   }
//
//   parseWebhook(req) → {
//     event:        'paid'|'expired'|'refunded'|'med_returned'|'ignored',
//     external_id:  string|null,
//     amount_cents: number|null,
//     paid_at:      number|null,
//     raw:          object
//   }
//
//   verifySignature(req, secret) → boolean
//
// Erros: jogar { code, message }. Connector NAO faz retry — quem chama decide.

class BaseConnector {
  constructor({ credentials = {}, providerId } = {}) {
    if (!providerId) throw new Error('BaseConnector requer providerId');
    this.providerId = providerId;
    this.credentials = credentials;
  }

  // Garante que credenciais obrigatorias estao presentes. Cada subclass
  // declara o que precisa via static REQUIRED_CREDS.
  ensureCreds() {
    const required = this.constructor.REQUIRED_CREDS || [];
    const missing = required.filter(k => !this.credentials[k]);
    if (missing.length) {
      const err = new Error(`credenciais ${this.providerId} faltando: ${missing.join(', ')}`);
      err.code = 'missing_credentials';
      err.missing = missing;
      throw err;
    }
  }

  /* eslint-disable no-unused-vars */
  async createCharge(args) {
    throw new Error(`${this.providerId}.createCharge nao implementado`);
  }

  parseWebhook(req) {
    throw new Error(`${this.providerId}.parseWebhook nao implementado`);
  }

  verifySignature(req, secret) {
    // Default: confia (use so se a PSP nao oferece HMAC).
    return true;
  }
  /* eslint-enable no-unused-vars */
}

// Util de centavos pra reais (alguns PSPs querem "10.50", outros 1050)
function centsToReaisString(cents) {
  return (Math.round(cents) / 100).toFixed(2);
}

function reaisStringToCents(s) {
  return Math.round(parseFloat(String(s).replace(',', '.')) * 100);
}

module.exports = { BaseConnector, centsToReaisString, reaisStringToCents };
