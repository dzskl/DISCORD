# BaaS — Sair da custódia direta de dinheiro

## Por quê isso é urgente

Hoje, **a BotDash funciona em zona cinza regulatória**: vendas entram via MysticPay, mas você segura o dinheiro do vendedor por 14 dias (hold), cobra reserva (5%), e processa saques. Em escala isso configura:

- **Intermediação de pagamentos** (BACEN — Lei 12.865/13)
- **Atividade de instituição de pagamento** sem autorização
- **Custódia de recursos de terceiros** sem licença

Riscos: notificação BACEN, MPC (Receita), bloqueio de conta bancária, ação civil pública.

**Solução**: não custodiar. Usar **Banking-as-a-Service (BaaS)** — cada vendedor tem **conta digital própria** dentro do parceiro BaaS. Você é apenas o software/UX por cima.

## Opções de BaaS no BR

| Provedor | Custo médio | Tempo integração | Compliance |
|---|---|---|---|
| **Iugu** | 0,99% por transação + R$ 0,40 PIX | 1-2 sem | Boa |
| **Asaas** | Similar | 1 sem | Boa |
| **Pagar.me** (Stone) | Mais caro mas robusto | 2-3 sem | Excelente |
| **Celcoin** | Enterprise, BAA puro | 4-6 sem | Top |
| **Stark Bank** | Foco em PJ, API limpa | 2 sem | Boa |

Recomendação: **Iugu** ou **Asaas** pra MVP — APIs simples, onboarding rápido.

## Modelo novo

```
ANTES (você custodia):
  Comprador --PIX--> MysticPay --R$--> SUA conta --PIX out--> Vendedor

DEPOIS (BaaS custodia):
  Comprador --PIX--> Iugu --R$--> SUBCONTA do vendedor --(saque programado)--> conta dele
  Você cobra fee da Iugu por API (split de pagamento)
```

## Implementação técnica

### 1. Onboarding do vendedor (split account)

Quando vendedor verifica KYC, cria subconta na Iugu:

```js
// services/baas.service.js
async function createSellerAccount(user) {
  const res = await fetch('https://api.iugu.com/v1/marketplace/create_account', {
    method: 'POST',
    headers: { Authorization: `Basic ${API_KEY}` },
    body: JSON.stringify({
      name: user.legal_name,
      commission_percent: 7.9,  // % que fica com a BotDash
    })
  });
  const data = await res.json();
  db.prepare('UPDATE users SET baas_account_id=?, baas_provider=? WHERE id=?')
    .run(data.account_id, 'iugu', user.id);
}
```

### 2. Checkout com split automático

```js
// Cria invoice com split definido — BaaS distribui no momento do pagamento
const invoice = await fetch('https://api.iugu.com/v1/invoices', {
  body: JSON.stringify({
    customer_id, items, splits: [
      { recipient_account_id: seller.baas_account_id, percent: 92.1 },
      // BotDash fica com o resto (7,9% comissao)
    ]
  })
});
```

### 3. Saque vira self-service

Vendedor pede saque → Iugu transfere da subconta dele pra conta bancária dele. **BotDash não toca no dinheiro.** Compliance e PIX out responsabilidade do BaaS.

### 4. Webhooks unificados

Iugu manda webhook quando invoice paga + quando split distribuído. Você só atualiza sale.status e dispara entregas.

## Migração — plano

**Fase 1 — Coexistência (2 semanas):**
- Implementa BaaS pra vendedores NOVOS
- Vendedores antigos continuam no fluxo MysticPay direto
- Toggle `users.payment_mode = baas | direct`

**Fase 2 — Migração compulsória (1 mês):**
- Vendedores antigos são notificados: "atualize sua conta — verificação KYC adicional"
- Vendedor com saldo aberto faz último saque pelo fluxo velho
- Saldo zero → migra pra BaaS

**Fase 3 — Cleanup (1 semana):**
- Remove fluxo de saque direto
- Adapta reconciliação pra usar BaaS

## Hold + reserva no BaaS

Iugu/Asaas têm "split com retencao programada" — você pode bloquear parte do split por X dias antes de liberar. Isso substitui seu hold/reserve atual.

```js
splits: [
  { recipient_account_id, percent: 92.1, release_after_days: 14 }
]
```

## Impacto financeiro

- **Comissão BaaS**: ~1% do volume (some R$ 10k em R$ 1M GMV/mês)
- **Sua margem cai 1pp**: ajustar pricing — Free passa de 7,9% pra 8,9% pra absorver
- **Você perde float**: BaaS fica com o juros do dinheiro retido
  - Compensação: cobra "saque expresso" R$ 5 (pagas R$ 1 ao BaaS, fica com R$ 4)

## Custo legal de operar sem BaaS

Em escala (R$ 10M+ GMV/mês):
- Risco regulatório: alta probabilidade de notificação BACEN
- Sem licença IP: multa, bloqueio
- Solução B (ter licença própria): R$ 500k+ em compliance + 1-2 anos

**Conclusão: migrar pra BaaS é mais barato que se tornar IP.**
