# Wallet Providers — guia de operacao

A "Wallet" e o modelo intermediario do BotDash: voce conecta sua propria
PSP (MercadoPago, Asaas, Stripe, NOWPayments etc.) e o dinheiro cai
direto na sua conta. BotDash so orquestra o checkout + entrega + DM.

Tabela rapida de providers suportados:

| Provider | Metodo | KYC | Taxa tipica | Refund via API | MED |
|---|---|---|---|---|---|
| MercadoPago | PIX | CPF | 0,99% PIX | ✅ | ✅ |
| PushinPay | PIX | CPF | R$ 0,99 ou 2,99% | ❌ | ❌ |
| Asaas | PIX | CPF/CNPJ | R$ 1,99 PIX | ✅ | ✅ |
| AbacatePay | PIX | CPF | 0,80% | ❌ | ❌ |
| MisticPay | PIX | CPF | contrato | ❌ | ❌ |
| Stripe | Cartao | strict | 3,99% + R$ 0,39 | ✅ | ❌ |
| Efi | PIX | CNPJ | R$ 0,09–0,80 | ⏳ | ❌ |
| NOWPayments | Cripto | easy | 0,4% | ❌ | n/a |

## Como conectar cada provider

Todos seguem o mesmo fluxo: voce abre `/wallet-providers.html`, clica em
"conectar" no PSP escolhido, cola as credenciais. Depois disso o checkout
da sua loja oferece esse PSP automaticamente.

### MercadoPago

1. Crie aplicacao em https://www.mercadopago.com.br/developers/panel/app
2. Em "Credenciais de producao" → copie o **Access Token** (`APP_USR-...`)
3. (Opcional) Em "Webhooks" gere o **Webhook Secret** pra validar HMAC
4. Cole `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` no `/wallet-providers.html`
5. **No painel MP, configure a URL do webhook como**:
   ```
   https://SEU-DOMINIO/webhooks/wallet/mercadopago
   ```
   Eventos: `payment.created`, `payment.updated`

### PushinPay

1. Cria conta em https://pushinpay.com.br
2. Em "API" → copia o **token de producao** (Bearer)
3. Cola `PUSHINPAY_TOKEN`. Opcionalmente define `PUSHINPAY_WEBHOOK_SECRET`
   (string compartilhada no header `x-pushinpay-webhook-secret`)
4. **URL do webhook**:
   ```
   https://SEU-DOMINIO/webhooks/wallet/pushinpay
   ```

### Asaas

1. Cria conta em https://www.asaas.com (CPF ou CNPJ)
2. Em "Integracoes > API > Chaves de API" → gera nova chave
3. Cola `ASAAS_API_KEY`. Sandbox: a chave comeca com `$aact_YTU5...`
4. (Opcional) Em "Notificacoes > Webhooks" define o **token de validacao**
   → cola em `ASAAS_WEBHOOK_TOKEN`
5. **URL do webhook**:
   ```
   https://SEU-DOMINIO/webhooks/wallet/asaas
   ```
   Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
   `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`

### AbacatePay

1. Cria conta em https://abacatepay.com
2. Em "API" → copia o token
3. Cola `ABACATE_API_KEY` + opcional `ABACATE_WEBHOOK_SECRET`
4. **URL do webhook**:
   ```
   https://SEU-DOMINIO/webhooks/wallet/abacatepay
   ```

### MisticPay

1. Acessa painel MisticPay
2. Em "Credenciais" copia `ci` (Client ID) e `cs` (Client Secret)
3. Cola `MISTICPAY_CLIENT_ID` + `MISTICPAY_CLIENT_SECRET`
4. (Opcional) `MISTICPAY_WEBHOOK_SECRET` pra HMAC-SHA256(id:status)
5. **URL do webhook**:
   ```
   https://SEU-DOMINIO/webhooks/wallet/misticpay
   ```

### Stripe

1. Painel: https://dashboard.stripe.com/apikeys
2. Pega a **Secret Key** (live ou test, com prefixo `sk_`)
3. Em "Developers > Webhooks" cria endpoint:
   ```
   https://SEU-DOMINIO/webhooks/wallet/stripe
   ```
   Eventos: `checkout.session.completed`, `checkout.session.expired`,
   `charge.refunded`
4. Copia o **Signing Secret** (whsec_...) → cola em `STRIPE_WEBHOOK_SECRET`

### Efi (ex-Gerencianet)

⚠️ Exige certificado ICP-Brasil. Sem o cert valido nao funciona.

1. Cria aplicacao em https://app.efipay.com.br → API → Nova aplicacao
2. Anota **Client ID** + **Client Secret**
3. Gera certificado .p12 em "API > Meus certificados"
4. Converte pra base64:
   ```sh
   base64 -w0 producao.p12 > efi-cert.txt
   ```
5. Cola o conteudo de `efi-cert.txt` em `EFI_CERTIFICATE`
6. Cadastra sua **chave PIX** de recebimento em `EFI_PIX_KEY`
7. **URL do webhook** (configurar no painel Efi):
   ```
   https://SEU-DOMINIO/webhooks/wallet/efi
   ```

### NOWPayments (cripto)

1. Cria conta em https://nowpayments.io
2. Em "Store Settings" cadastra wallet de recebimento por moeda
   (recomendado: USDT TRC-20 + BTC + ETH)
3. Em "API Keys" → cria chave → cola em `NOWPAYMENTS_API_KEY`
4. Em "Settings > IPN" gera o **IPN Secret Key** → cola em
   `NOWPAYMENTS_IPN_SECRET`
5. **URL do webhook**:
   ```
   https://SEU-DOMINIO/webhooks/wallet/nowpayments
   ```

## Como o sistema lida com falhas

### Webhook perdido (rede / DNS / firewall)

O job `wallet-polling.js` roda a cada **3 minutos** e busca todas as
sales `pending` com mais de 10 minutos. Pra cada uma, chama
`fetchPayment` na PSP e atualiza o status. Webhook perdido = problema
resolvido sem acao manual.

### Webhook duplicado

`webhook_events` tem `UNIQUE(gateway, event_id)`. Se chegar 2x, segundo
ignora. O `fulfillSale` tambem e idempotente: `status='paid'` ja
existente → retorna `already_paid:true` sem efeitos colaterais.

### Refund

`POST /api/checkout/wallet/refund/:sale_id` chama `connector.refundPayment`
na PSP. So funciona em MP/Asaas/Stripe (outros retornam 501).
A sale vira `status='refunded'`. Quem orquestra reverter o ledger eh o
webhook que chega depois (PSP emite `payment.refunded`).

### MED (devolucao PIX bancaria)

Quando o banco emissor solicita devolucao, a PSP avisa via webhook:
- **MP**: `payment.refunded` com `refund_reason='dispute'` OR
  `status='charged_back'`
- **Asaas**: evento `PAYMENT_CHARGEBACK_REQUESTED` ou
  `PAYMENT_CHARGEBACK_DISPUTE`

O `med.service.js` processa:
1. Marca sale como `med_returned`
2. Reverte ledger (debita seller, credita `platform:med_returns`)
3. Bloqueia saques pendentes/aprovados do valor MED
4. Notifica vendedor via `/app.html#vendas`

Vendedor ve a sale na aba **MED** em `/wallet-sales.html` com chip
vermelho. Nao pode reverter via UI — banco emissor controla.

### Reconciliacao on-chain (cripto)

A cada hora, `crypto-recon.service.js` valida cada sale paga via
NOWPayments contra o explorer publico da rede:
- Tx existe e foi confirmada
- Endereco de destino bate com o cadastrado
- Valor on-chain >= valor esperado

Sales com divergencia ganham `recon_status` populado com o JSON do
problema (visivel via SQL ou api futura).

## URL de webhook por provider

Padrao: `https://SEU-DOMINIO/webhooks/wallet/{provider_id}`

```
mercadopago → /webhooks/wallet/mercadopago
pushinpay   → /webhooks/wallet/pushinpay
asaas       → /webhooks/wallet/asaas
abacatepay  → /webhooks/wallet/abacatepay
misticpay   → /webhooks/wallet/misticpay
stripe      → /webhooks/wallet/stripe
efi         → /webhooks/wallet/efi
nowpayments → /webhooks/wallet/nowpayments
```

## Migracao dos endpoints legados

Os endpoints abaixo continuam funcionando mas estao marcados como
deprecated (Sunset 2026-12-31):

- `POST /api/checkout/create-session` (Stripe legado) →
  `POST /api/checkout/wallet/create` com `provider: 'stripe'`
- `POST /api/checkout/pix/create` (MisticPay legado) →
  `POST /api/checkout/wallet/create` com `provider: 'misticpay'`
- `POST /api/checkout/webhook` (Stripe webhook legado) →
  `POST /webhooks/wallet/stripe`
- `POST /api/checkout/pix/webhook` (MisticPay webhook legado) →
  `POST /webhooks/wallet/misticpay`

**Pra migrar**: configure o provider em `/wallet-providers.html` e ja
funciona — o checkout da sua loja vai oferecer a wallet
automaticamente. Os endpoints velhos podem ser deixados ativos durante
a transicao (3-6 meses de sobreposicao recomendado).

A UI mostra um banner amarelo quando detecta vendas no fluxo legado
(comparativo `legacy_sales_30d` vs `wallet_sales_30d`).
