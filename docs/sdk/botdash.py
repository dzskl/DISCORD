# BotDash Python SDK (auto-gerado por scripts/generate-sdk.js)
# Nao edite — re-rode o script.
#
# Uso:
#   from botdash import BotDashClient
#   bd = BotDashClient(base_url='https://SEU-DOMINIO', api_key='bd_...')
#   sales = bd.list_checkout_wallet_sales(query={'limit': 10})

import json
import urllib.request, urllib.parse, urllib.error

class BotDashError(Exception):
    def __init__(self, message, status=None, body=None, rate_limit=None):
        super().__init__(message)
        self.status = status
        self.body = body
        self.rate_limit = rate_limit or {}

class BotDashClient:
    def __init__(self, base_url, api_key, version=None):
        if not base_url: raise ValueError('base_url obrigatorio')
        if not api_key:  raise ValueError('api_key obrigatorio')
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.version = version

    def _request(self, method, path, body=None, idempotency_key=None, query=None):
        url = self.base_url + path
        if query:
            clean = {k: v for k, v in query.items() if v is not None}
            if clean: url += '?' + urllib.parse.urlencode(clean)
        headers = {
            'Authorization': 'Bearer ' + self.api_key,
            'Content-Type': 'application/json',
            'User-Agent': 'BotDash-SDK-Python/1.0'
        }
        if self.version: headers['BotDash-Version'] = self.version
        if idempotency_key: headers['Idempotency-Key'] = idempotency_key
        data = json.dumps(body).encode('utf-8') if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8') or '{}')
        except urllib.error.HTTPError as e:
            try: parsed = json.loads(e.read().decode('utf-8'))
            except Exception: parsed = None
            rl = {
                'limit':       e.headers.get('X-RateLimit-Limit'),
                'remaining':   e.headers.get('X-RateLimit-Remaining'),
                'reset':       e.headers.get('X-RateLimit-Reset'),
                'retry_after': e.headers.get('Retry-After')
            }
            raise BotDashError(
                (parsed.get('error') if parsed else None) or f'HTTP {e.code}',
                status=e.code, body=parsed, rate_limit=rl
            )

    # GET /api/checkout/wallet/sales — Lista vendas processadas via Wallet
    def list_checkout_wallet_sales(self, idempotency_key=None, query=None):
        path = '/api/checkout/wallet/sales'
        return self._request('GET', path, query=query, idempotency_key=idempotency_key)

    # GET /api/checkout/wallet/sales.csv — Exporta vendas em CSV
    def list_checkout_wallet_salescsv(self, idempotency_key=None, query=None):
        path = '/api/checkout/wallet/sales.csv'
        return self._request('GET', path, query=query, idempotency_key=idempotency_key)

    # GET /api/checkout/wallet/sale/{sale_id}/timeline — Timeline de eventos de uma venda
    def get_checkout_wallet_sale_timeline(self, sale_id, idempotency_key=None, query=None):
        path = '/api/checkout/wallet/sale/' + urllib.parse.quote(str(sale_id)) + '/timeline'
        return self._request('GET', path, query=query, idempotency_key=idempotency_key)

    # POST /api/checkout/wallet/refund/{sale_id} — Reembolsa uma venda
    def create_checkout_wallet_refund(self, sale_id, body=None, idempotency_key=None, query=None):
        path = '/api/checkout/wallet/refund/' + urllib.parse.quote(str(sale_id)) + ''
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # POST /api/checkout/wallet/refund/bulk — Reembolsa multiplas vendas
    def create_checkout_wallet_refund_bulk(self, body=None, idempotency_key=None, query=None):
        path = '/api/checkout/wallet/refund/bulk'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # POST /api/sandbox/create-sale — [SANDBOX] Cria sale de teste sem checkout real
    def create_sandbox_create_sale(self, body=None, idempotency_key=None, query=None):
        path = '/api/sandbox/create-sale'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # POST /api/sandbox/simulate-payment/{sale_id} — [SANDBOX] Simula evento da PSP na sale
    def create_sandbox_simulate_payment(self, sale_id, body=None, idempotency_key=None, query=None):
        path = '/api/sandbox/simulate-payment/' + urllib.parse.quote(str(sale_id)) + ''
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # GET /api/api-keys — Lista chaves do user (cookie auth only)
    def list_api_keys(self, idempotency_key=None, query=None):
        path = '/api/api-keys'
        return self._request('GET', path, query=query, idempotency_key=idempotency_key)

    # POST /api/api-keys — Cria nova api key
    def create_api_keys(self, body=None, idempotency_key=None, query=None):
        path = '/api/api-keys'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # POST /api/api-keys/{id}/rotate — Rotaciona chave (revoga antiga, gera nova com mesmas configs)
    def create_api_keys_rotate(self, id, body=None, idempotency_key=None, query=None):
        path = '/api/api-keys/' + urllib.parse.quote(str(id)) + '/rotate'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # GET /api/outbound-webhooks — Lista webhooks de saida configurados
    def list_outbound_webhooks(self, idempotency_key=None, query=None):
        path = '/api/outbound-webhooks'
        return self._request('GET', path, query=query, idempotency_key=idempotency_key)

    # POST /api/outbound-webhooks — Cria webhook
    def create_outbound_webhooks(self, body=None, idempotency_key=None, query=None):
        path = '/api/outbound-webhooks'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # POST /api/outbound-webhooks/{id}/rotate-secret — Gera novo secret HMAC pro webhook
    def create_outbound_webhooks_rotate_secret(self, id, body=None, idempotency_key=None, query=None):
        path = '/api/outbound-webhooks/' + urllib.parse.quote(str(id)) + '/rotate-secret'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)

    # GET /api/outbound-webhooks/source-ips — IPs do BotDash que enviam webhooks (pra IP allowlist no firewall)
    def list_outbound_webhooks_source_ips(self, idempotency_key=None, query=None):
        path = '/api/outbound-webhooks/source-ips'
        return self._request('GET', path, query=query, idempotency_key=idempotency_key)

    # POST /api/checkout/wallet/sale/{sale_id}/dispute — Marca venda como MED manualmente
    def create_checkout_wallet_sale_dispute(self, sale_id, body=None, idempotency_key=None, query=None):
        path = '/api/checkout/wallet/sale/' + urllib.parse.quote(str(sale_id)) + '/dispute'
        return self._request('POST', path, body=body, idempotency_key=idempotency_key, query=query)
