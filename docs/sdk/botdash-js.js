// BotDash JS SDK (auto-gerado por scripts/generate-sdk.js)
// NAO edite — re-rode o script.

export class BotDashClient {
  constructor({ baseUrl, apiKey, version }) {
    if (!baseUrl) throw new Error('baseUrl obrigatorio');
    if (!apiKey)  throw new Error('apiKey obrigatorio');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.version = version || null;
  }

  async _request(method, path, { body, idempotencyKey, query } = {}) {
    let url = this.baseUrl + path;
    if (query) {
      const qs = new URLSearchParams(Object.entries(query).filter(([_, v]) => v != null));
      if ([...qs].length) url += '?' + qs.toString();
    }
    const headers = {
      'Authorization': 'Bearer ' + this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'BotDash-SDK-JS/1.0'
    };
    if (this.version) headers['BotDash-Version'] = this.version;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(url, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let parsed = null; try { parsed = JSON.parse(text); } catch {}
    if (!res.ok) {
      const err = new Error((parsed && parsed.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.body = parsed || text;
      err.rateLimit = {
        limit:     res.headers.get('X-RateLimit-Limit'),
        remaining: res.headers.get('X-RateLimit-Remaining'),
        reset:     res.headers.get('X-RateLimit-Reset'),
        retryAfter:res.headers.get('Retry-After')
      };
      throw err;
    }
    return parsed;
  }

  // GET /api/checkout/wallet/sales — Lista vendas processadas via Wallet
  async listCheckoutWalletSales(opts = {}) {
    const path = '/api/checkout/wallet/sales';
    return this._request('GET', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });
  }

  // GET /api/checkout/wallet/sales.csv — Exporta vendas em CSV
  async listCheckoutWalletSalescsv(opts = {}) {
    const path = '/api/checkout/wallet/sales.csv';
    return this._request('GET', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });
  }

  // GET /api/checkout/wallet/sale/{sale_id}/timeline — Timeline de eventos de uma venda
  async getCheckoutWalletSaleTimeline(sale_id, opts = {}) {
    const path = '/api/checkout/wallet/sale/' + encodeURIComponent(sale_id) + '/timeline';
    return this._request('GET', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });
  }

  // POST /api/checkout/wallet/refund/{sale_id} — Reembolsa uma venda
  async createCheckoutWalletRefund(sale_id, body, opts = {}) {
    const path = '/api/checkout/wallet/refund/' + encodeURIComponent(sale_id) + '';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // POST /api/checkout/wallet/refund/bulk — Reembolsa multiplas vendas
  async createCheckoutWalletRefundBulk(body, opts = {}) {
    const path = '/api/checkout/wallet/refund/bulk';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // POST /api/sandbox/create-sale — [SANDBOX] Cria sale de teste sem checkout real
  async createSandboxCreateSale(body, opts = {}) {
    const path = '/api/sandbox/create-sale';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // POST /api/sandbox/simulate-payment/{sale_id} — [SANDBOX] Simula evento da PSP na sale
  async createSandboxSimulatePayment(sale_id, body, opts = {}) {
    const path = '/api/sandbox/simulate-payment/' + encodeURIComponent(sale_id) + '';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // GET /api/api-keys — Lista chaves do user (cookie auth only)
  async listApiKeys(opts = {}) {
    const path = '/api/api-keys';
    return this._request('GET', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });
  }

  // POST /api/api-keys — Cria nova api key
  async createApiKeys(body, opts = {}) {
    const path = '/api/api-keys';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // POST /api/api-keys/{id}/rotate — Rotaciona chave (revoga antiga, gera nova com mesmas configs)
  async createApiKeysRotate(id, body, opts = {}) {
    const path = '/api/api-keys/' + encodeURIComponent(id) + '/rotate';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // GET /api/outbound-webhooks — Lista webhooks de saida configurados
  async listOutboundWebhooks(opts = {}) {
    const path = '/api/outbound-webhooks';
    return this._request('GET', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });
  }

  // POST /api/outbound-webhooks — Cria webhook
  async createOutboundWebhooks(body, opts = {}) {
    const path = '/api/outbound-webhooks';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // POST /api/outbound-webhooks/{id}/rotate-secret — Gera novo secret HMAC pro webhook
  async createOutboundWebhooksRotateSecret(id, body, opts = {}) {
    const path = '/api/outbound-webhooks/' + encodeURIComponent(id) + '/rotate-secret';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }

  // GET /api/outbound-webhooks/source-ips — IPs do BotDash que enviam webhooks (pra IP allowlist no firewall)
  async listOutboundWebhooksSourceIps(opts = {}) {
    const path = '/api/outbound-webhooks/source-ips';
    return this._request('GET', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });
  }

  // POST /api/checkout/wallet/sale/{sale_id}/dispute — Marca venda como MED manualmente
  async createCheckoutWalletSaleDispute(sale_id, body, opts = {}) {
    const path = '/api/checkout/wallet/sale/' + encodeURIComponent(sale_id) + '/dispute';
    return this._request('POST', path, {
      body, idempotencyKey: opts.idempotencyKey, query: opts.query
    });
  }
}

// Exemplo:
//   import { BotDashClient } from './botdash-js.js';
//   const bd = new BotDashClient({ baseUrl: 'https://SEU-DOMINIO', apiKey: 'bd_...' });
//   const { sales } = await bd.listCheckoutWalletSales({ query: { limit: 10 } });
