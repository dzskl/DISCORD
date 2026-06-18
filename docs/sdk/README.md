# BotDash SDKs

SDKs auto-gerados a partir do `docs/openapi.yaml`. Re-gere com:

```sh
npm run sdk:generate
```

3 artefatos:

- **`botdash-js.js`** — ES module pra browser ou Node (`type: "module"`)
- **`botdash.py`** — Python 3 puro, zero deps externas (urllib stdlib)
- **`botdash.postman_collection.json`** — import direto no Postman

## JavaScript

```html
<script type="module">
  import { BotDashClient } from './botdash-js.js';

  const bd = new BotDashClient({
    baseUrl: 'https://app.botdash.com',
    apiKey: 'bd_a1b2_secret-32-chars-aqui',
    version: '2026-06-15'    // opcional
  });

  // Listar vendas
  const { sales, paging } = await bd.listCheckoutWalletSales({
    query: { status: 'paid', limit: 50 }
  });

  // Refund com idempotency
  await bd.createCheckoutWalletRefund(123, { reason: 'cliente' }, {
    idempotencyKey: crypto.randomUUID()
  });

  // Bulk refund
  await bd.createCheckoutWalletRefundBulk(null, {
    sale_ids: [1, 2, 3],
    reason: 'recall'
  });
</script>
```

### Tratamento de erro

```js
try {
  await bd.createCheckoutWalletRefund(123);
} catch (e) {
  console.error(e.status);      // 429, 401, etc.
  console.error(e.body);        // { error, code, ... }
  console.error(e.rateLimit);   // { limit, remaining, reset, retryAfter }
  if (e.status === 429) await sleep(e.rateLimit.retryAfter * 1000);
}
```

## Python

```py
from botdash import BotDashClient, BotDashError

bd = BotDashClient(
    base_url='https://app.botdash.com',
    api_key='bd_a1b2_secret-32-chars-aqui',
    version='2026-06-15'   # opcional
)

# Listar vendas
data = bd.list_checkout_wallet_sales(query={'status': 'paid', 'limit': 50})
for sale in data['sales']:
    print(sale['id'], sale['amount_cents'])

# Refund com idempotency
import uuid
bd.create_checkout_wallet_refund(
    123,
    body={'reason': 'cliente'},
    idempotency_key=str(uuid.uuid4())
)

# Erros
try:
    bd.create_checkout_wallet_refund(999)
except BotDashError as e:
    print(e.status, e.body, e.rate_limit)
```

## Postman

1. Import `docs/sdk/botdash.postman_collection.json`
2. Em "Variables" da collection, set:
   - `base_url` = `https://app.botdash.com`
   - `api_key` = `bd_xxx_yyy`
   - `api_version` = `2026-06-15`
3. Headers opcionais (`BotDash-Version`, `Idempotency-Key`) já vêm como
   `disabled: true` em cada request — habilite quando precisar.

## CLI

Para uso em terminal/scripts:

```sh
export BOTDASH_API_URL=https://app.botdash.com
export BOTDASH_API_KEY=bd_a1b2_xxx

npm run cli -- sales list --status=paid --limit=10
npm run cli -- refund 123 --reason="cliente solicitou" --idempotency=$(uuidgen)
npm run cli -- sandbox create --amount=5000 --provider=mercadopago
npm run cli -- sandbox pay 456 --event=paid
```

## Webhook receiver (dev)

Servidor local pra receber + validar HMAC dos outbound webhooks:

```sh
npm run webhook:receive -- <secret>
# Em outro terminal: ngrok http 4001
# Configure o webhook do BotDash apontando pra URL do ngrok
```

Mostra payload + status HMAC v1/v2 + dedup por delivery uuid.
