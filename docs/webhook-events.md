# Outbound Webhook Events

Quando algo acontece numa venda no BotDash, mandamos POST pro seu
endpoint configurado em `/api-and-webhooks.html`. Cada evento tem
schema canônico documentado aqui.

## Envelope comum

Toda request POST chega com este shape:

```json
{
  "event": "sale.paid",
  "delivery": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "sent_at": "2026-06-16T01:23:45.000Z",
  "data": { /* específico do evento */ }
}
```

Headers:

```http
Content-Type: application/json
X-BotDash-Event: sale.paid
X-BotDash-Delivery: <uuid>
X-BotDash-Timestamp: 1750000000
X-BotDash-Signature: sha256=<hex>           # v1 legado
X-BotDash-Signature-V2: t=<ts>,v2=<hex>     # recomendado (anti-replay)
User-Agent: BotDash-Webhook/2.0
```

## Verificação HMAC v2 (recomendada)

A v2 inclui o timestamp na string assinada e permite rejeitar eventos
com mais de 5min (defesa contra replay attack):

```js
const crypto = require('crypto');
function verifyV2(rawBody, sigHeader, tsHeader, secret) {
  const ts = parseInt(tsHeader);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;   // 5min tolerance
  const expected = 't=' + ts + ',v2=' +
    crypto.createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
}
```

## Idempotência

Use o `delivery` UUID pra deduplicar:

```js
if (await seen(delivery)) return res.sendStatus(200);
await markSeen(delivery);
await process(payload);
```

---

## `sale.paid`

Disparado quando o pagamento é confirmado e o fulfillment (entrega +
hold + ledger + points + referral) completou.

```json
{
  "event": "sale.paid",
  "delivery": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "sent_at": "2026-06-16T01:23:45.000Z",
  "data": {
    "user_id": 1,
    "guild_id": "12345678",
    "sale_id": 123,
    "amount_cents": 5000,
    "net_cents": 5000,
    "discord_id": "123456789012345678",
    "discord_tag": "joao",
    "provider": "mercadopago",
    "provider_charge_id": "98765",
    "paid_at": 1750000000,
    "products": ["Cargo VIP", "Mensagem custom"]
  }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `user_id` | int | Vendedor (owner/admin da guild) |
| `guild_id` | string\|null | ID da guild Discord onde a venda foi feita |
| `sale_id` | int | ID da venda no BotDash |
| `amount_cents` | int | Valor bruto pago em centavos BRL |
| `net_cents` | int | Líquido pro vendedor (após platform fee, hoje = amount) |
| `discord_id` | string | ID Discord do comprador |
| `discord_tag` | string\|null | username do comprador |
| `provider` | string | PSP que processou (mercadopago, asaas, etc.) |
| `provider_charge_id` | string | ID da cobrança na PSP |
| `paid_at` | int | Unix timestamp do pagamento |
| `products` | string[] | Nomes dos produtos entregues |

---

## `sale.refunded`

Disparado após refund (manual via UI/API ou automático via webhook do
PSP). Pode ser parcial ou total.

```json
{
  "event": "sale.refunded",
  "delivery": "...",
  "sent_at": "2026-06-16T...",
  "data": {
    "user_id": 1,
    "guild_id": "12345678",
    "sale_id": 123,
    "amount_cents": 5000,
    "provider": "mercadopago",
    "provider_charge_id": "98765"
  }
}
```

Campos iguais a `sale.paid` (omitindo `discord_tag`, `paid_at`,
`net_cents`, `products`).

---

## `sale.med_returned`

Devolução PIX bancária (MED). Cliente do banco solicitou devolução,
saque correspondente foi bloqueado, ledger foi revertido.

```json
{
  "event": "sale.med_returned",
  "delivery": "...",
  "sent_at": "2026-06-16T...",
  "data": {
    "user_id": 1,
    "guild_id": "12345678",
    "sale_id": 123,
    "amount_cents": 5000,
    "net_cents": 5000,
    "discord_id": "123456789012345678",
    "provider": "asaas",
    "provider_charge_id": "98765",
    "reason": "Asaas PAYMENT_CHARGEBACK_REQUESTED"
  }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `reason` | string | Motivo (texto da PSP ou "marcada manualmente") |

---

## `webhook.test`

Disparado quando o vendedor clica "testar" no `/api-and-webhooks.html`.
Não acompanha venda real.

```json
{
  "event": "webhook.test",
  "delivery": "...",
  "sent_at": "2026-06-16T...",
  "data": {
    "test": true,
    "message": "ping do BotDash",
    "user_id": 1
  }
}
```

---

## Retry & failure handling

| Cenário | Comportamento |
|---|---|
| Seu endpoint retorna 2xx | ✅ Sucesso. `failure_count` zerado. |
| Retorna não-2xx ou timeout (5s) | ❌ Falha. `failure_count++` |
| 5 falhas consecutivas | 🛑 Webhook auto-desabilitado (`active=0`). Vendedor reativa em `/api-and-webhooks.html` |
| Falha intermitente | Retry automático com backoff: +30s, +2min, +8min, +32min (jitter 0–30s por hook) |
| Resend manual | `POST /api/outbound-webhooks/attempts/<id>/resend` |

## Boas práticas no seu endpoint

1. **Responda 200 rapidamente** — processe em fila/queue, não bloqueie a request
2. **Valide HMAC v2** com timestamp tolerance de 5min
3. **Deduplique** por `X-BotDash-Delivery`
4. **Idempotente**: mesmo evento pode chegar 2x se sua URL responder lento
5. **Não retorne 2xx em erro**: melhor 500 pra ativar nosso retry do que processar errado
