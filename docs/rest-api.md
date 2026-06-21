# BotDash REST API

API publica pra integrar o BotDash com sistemas externos (Zapier, n8n,
backoffice proprio, dashboards). Autenticada via **API key Bearer**.

Base URL: `https://SEU-DOMINIO`

## Autenticacao

Crie uma chave em `/api-and-webhooks.html`. Use no header:

```http
Authorization: Bearer bd_<prefix>_<secret>
```

Chave eh exibida UMA VEZ ao criar — guarde em local seguro.

### Scopes disponiveis

| Scope            | O que libera |
|------------------|---|
| `read:sales`     | listar vendas, ver timeline |
| `write:refund`   | disparar refund individual ou em lote |
| `read:balance`   | saldo total + por PSP |
| `read:providers` | listar PSPs configuradas (sem expor creds) |
| `write:dispute`  | marcar venda como MED manualmente |

Endpoints retornam **403** se a chave nao tem o scope necessario.

## Rate limits

| Endpoint                                | Limite por API key | Limite por IP (fallback) |
|-----------------------------------------|--------------------|---|
| `GET  /api/checkout/wallet/sales*`      | 120/min            | 120/min |
| `POST /api/checkout/wallet/refund/*`    | 30/min             | 30/min  |
| `POST /api/checkout/wallet/create`      | n/a (guild scope)  | 60/min/guild |

Header `Retry-After` em segundos quando estourar (HTTP 429).

## Endpoints

### Listar vendas

```http
GET /api/checkout/wallet/sales?status=paid&provider=mercadopago&limit=50
Authorization: Bearer bd_<...>
```

Resposta:
```json
{
  "sales": [
    {
      "id": 123,
      "status": "paid",
      "provider": "mercadopago",
      "provider_charge_id": "12345678",
      "amount_cents": 5000,
      "net_to_owner_cents": 5000,
      "discord_id": "123456789012345678",
      "discord_tag": "joao",
      "product_name": "Cargo VIP",
      "paid_at": 1750000000,
      "created_at": 1749999000
    }
  ]
}
```

Filtros (todos opcionais):
- `status` — `paid`, `refunded`, `med_returned`
- `provider` — id do PSP
- `limit` — max 100, default 50

### Exportar CSV

```sh
curl -L -H "Authorization: Bearer bd_..." \
  https://SEU-DOMINIO/api/checkout/wallet/sales.csv > sales.csv
```

12 colunas: `id,status,provider,charge_id,pay_currency,amount_brl,net_brl,discord_id,discord_tag,product,created_at,paid_at`

### Refund individual

```http
POST /api/checkout/wallet/refund/123
Authorization: Bearer bd_<...>
Content-Type: application/json

{ "value": 5000, "reason": "cliente solicitou" }
```

`value` em centavos opcional (omitido = total). Funciona em MP/Asaas/Stripe.

Resposta `200`:
```json
{ "ok": true, "raw": { ...resposta da PSP } }
```

### Refund em lote

```http
POST /api/checkout/wallet/refund/bulk
Authorization: Bearer bd_<...>
Content-Type: application/json

{ "sale_ids": [1, 2, 3], "reason": "recall do produto X" }
```

Max 50 por batch.

Resposta:
```json
{
  "summary": { "ok": 2, "failed": 1 },
  "results": {
    "1": { "ok": true },
    "2": { "ok": true },
    "3": { "ok": false, "error": "provider sem refund", "code": "no_refund_api" }
  }
}
```

### Marcar MED manual

```http
POST /api/checkout/wallet/sale/123/dispute
Authorization: Bearer bd_<...>
Content-Type: application/json

{ "reason": "extrato bancario indica chargeback" }
```

Marca como `med_returned`, reverte ledger, bloqueia saque, notifica
vendedor via DM.

### Timeline da venda

```http
GET /api/checkout/wallet/sale/123/timeline
Authorization: Bearer bd_<...>
```

```json
{
  "sale": { "id": 123, "status": "paid", "provider": "mercadopago", ... },
  "events": [
    { "type": "created", "at": 1749999000, "label": "Cobranca criada" },
    { "type": "paid",    "at": 1750000000, "label": "Pagamento confirmado" },
    { "type": "webhook", "at": 1750000001, "label": "webhook mercadopago (paid)" }
  ]
}
```

## Outbound Webhooks

Configure em `/api-and-webhooks.html`. BotDash POSTa no seu endpoint
quando algo acontece.

### Eventos

| Evento              | Quando dispara |
|---------------------|---|
| `sale.paid`         | Pagamento confirmado (fulfillment completo) |
| `sale.refunded`     | Refund processado pela PSP |
| `sale.med_returned` | Devolucao bancaria (MED) ou dispute manual |
| `*`                 | Wildcard: todos os eventos |

### Payload

```json
{
  "event": "sale.paid",
  "delivery": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "sent_at": "2026-06-16T01:23:45.000Z",
  "data": {
    "user_id": 1,
    "guild_id": "12345",
    "sale_id": 123,
    "amount_cents": 5000,
    "net_cents": 5000,
    "discord_id": "123456789012345678",
    "discord_tag": "joao",
    "provider": "mercadopago",
    "provider_charge_id": "98765",
    "paid_at": 1750000000,
    "products": ["Cargo VIP"]
  }
}
```

### Headers

```http
X-BotDash-Event: sale.paid
X-BotDash-Delivery: <uuid>
X-BotDash-Signature: sha256=<hmac>
User-Agent: BotDash-Webhook/1.0
```

### Verificar assinatura

```js
const crypto = require('crypto');

function verify(body, signatureHeader, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)         // body cru, pre-JSON.parse
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}
```

Python:
```py
import hmac, hashlib
def verify(body, sig_header, secret):
    expected = 'sha256=' + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_header)
```

### Retry & disable

- Falha (status != 2xx OR timeout 5s) -> attempt registrado, contador
  `failure_count++`
- **5 falhas consecutivas** -> webhook auto-desabilitado (`active=0`).
  Vendedor reativa em `/api-and-webhooks.html`
- **Retry automatico** com backoff exponencial (cron 5min):
  - +30s, +5min, +1h, +6h
  - depois de 5 tentativas para
- **Resend manual** via UI ou:
  ```http
  POST /api/outbound-webhooks/attempts/:attempt_id/resend
  ```

### Idempotencia (importante)

Mesmo evento pode chegar 2x se sua URL responde 200 mas demora. Use o
`delivery` (UUID) pra deduplicar no seu lado:

```js
if (await alreadyProcessed(delivery)) return res.sendStatus(200);
await processEvent(payload);
await markProcessed(delivery);
res.sendStatus(200);
```

## Exemplos curl

### Listar ultimas 10 vendas

```sh
curl -s -H "Authorization: Bearer bd_$KEY" \
  "https://SEU-DOMINIO/api/checkout/wallet/sales?limit=10" | jq
```

### Reembolsar venda

```sh
curl -X POST -H "Authorization: Bearer bd_$KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason":"cliente desistiu"}' \
  https://SEU-DOMINIO/api/checkout/wallet/refund/123
```

### Reembolso em lote

```sh
curl -X POST -H "Authorization: Bearer bd_$KEY" \
  -H "Content-Type: application/json" \
  -d '{"sale_ids":[10,11,12],"reason":"recall"}' \
  https://SEU-DOMINIO/api/checkout/wallet/refund/bulk
```

### Receber webhook (Express)

```js
const express = require('express');
const crypto = require('crypto');
const app = express();
const SECRET = process.env.BOTDASH_WEBHOOK_SECRET;
const seen = new Set();

app.post('/botdash-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['x-botdash-signature'];
    const expected = 'sha256=' + crypto
      .createHmac('sha256', SECRET).update(req.body).digest('hex');
    if (sig !== expected) return res.status(401).send('bad sig');

    const evt = JSON.parse(req.body);
    if (seen.has(evt.delivery)) return res.sendStatus(200);
    seen.add(evt.delivery);

    console.log(`${evt.event}: sale #${evt.data.sale_id}`);
    // ... sua logica ...
    res.sendStatus(200);
  }
);

app.listen(3000);
```

## Codigos de erro

| HTTP | Significado |
|------|-------------|
| 400  | parametros invalidos (body mal-formado, scope errado) |
| 401  | API key invalida, expirada ou sem Bearer |
| 403  | API key sem o scope requerido |
| 404  | recurso nao existe |
| 409  | conflito (ex: produto sem estoque) |
| 429  | rate limit excedido (use header `Retry-After`) |
| 501  | feature nao implementada pro provider (ex: refund em PushinPay) |
| 502  | erro upstream na PSP |
| 503  | feature nao configurada (provider sem creds) |
