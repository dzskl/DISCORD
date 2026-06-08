# Pricing v2 — Modelo de planos

## Visão

| Plano | Mensalidade | Comissão % | Taxa fixa | Hold (novato/estab) | Branding |
|---|---|---|---|---|---|
| **Free** | R$ 0 | 7,9% | R$ 1,49 | 14d / 14d | obrigatório |
| **Starter** | R$ 47 | 5,9% | R$ 1,49 | 7d / 2d | livre |
| **Pro** | R$ 97 | 3,9% | R$ 0,99 | 2d / 2d | livre |
| **Scale** | R$ 297 | 2,9% | R$ 0,49 | 1d / 1d | white-label |

## Comparativo competitivo (BR, 2026)

| Plataforma | % | Fixa | Mensalidade |
|---|---|---|---|
| Hotmart | 9,9% | R$ 1 | 0 |
| Eduzz | 7,9% | R$ 2 | 0 |
| Kiwify | 4,99% | R$ 1 | 0 |
| **BotDash Free** | 7,9% | R$ 1,49 | 0 |
| **BotDash Starter** | 5,9% | R$ 1,49 | R$ 47 |
| **BotDash Pro** | 3,9% | R$ 0,99 | R$ 97 |
| **BotDash Scale** | 2,9% | R$ 0,49 | R$ 297 |

## Quando upgrade compensa

- **Starter (R$ 47)** se paga em **~23 vendas/mês** de R$ 50 (vs Free)
- **Pro (R$ 97)** se paga em **~48 vendas/mês** de R$ 50 (vs Free)
- **Scale (R$ 297)** se paga em **~80 vendas/mês** de R$ 100 (vs Pro)

## Features por plano

| Feature | Free | Starter | Pro | Scale |
|---|---|---|---|---|
| Produtos | 10 | ∞ | ∞ | ∞ |
| Cupons | 3 | ∞ | ∞ | ∞ |
| Afiliados | 0 | 5 | ∞ | ∞ |
| Sorteios ativos | 1 | ∞ | ∞ | ∞ |
| Multi-bot | — | — | até 3 | ∞ |
| API + Webhooks | — | — | ✓ | ✓ |
| Audit log | — | ✓ | ✓ | ✓ |
| Branding "Powered by" | obrigatório | removível | removível | white-label |
| Selo Verificado | pago | incluso | incluso | incluso |
| Featured slots | pago | pago | 1 grátis | 3 grátis |
| Antecipação | 2,99% | 2,49% | 1,99% | 1,49% |
| Saque mínimo | R$ 50 | R$ 30 | R$ 10 | R$ 5 |
| Saque automático diário | — | — | ✓ | ✓ |
| Suporte | comunidade | email | prioritário | account manager |
| SLA | — | — | — | 99,9% |

## Add-ons (one-time ou recorrente)

| Add-on | Preço | Aplica a |
|---|---|---|
| Domínio próprio | R$ 29/mês | Starter+ |
| Webhooks avançados | R$ 19/mês | Starter+ |
| Emails transacionais (com domínio próprio) | R$ 19/mês | Starter+ |
| Insurance chargeback | R$ 49/mês | Pro+ |
| Setup assistido (1h call) | R$ 297 one-time | Todos |
| Migração de plataforma | R$ 497 one-time | Todos |

## Receita projetada por vendedor médio

Vendedor que faz **R$ 1.000 GMV/mês** (20 vendas de R$ 50):

| Plano | Comissão | Taxa fixa | Mensalidade | Total mensal pra BotDash |
|---|---|---|---|---|
| Free | R$ 79 | R$ 29,80 | R$ 0 | **R$ 109** |
| Starter | R$ 59 | R$ 29,80 | R$ 47 | **R$ 136** |
| Pro | R$ 39 | R$ 19,80 | R$ 97 | **R$ 156** |
| Scale | R$ 29 | R$ 9,80 | R$ 297 | **R$ 336** |

**Insight:** quanto mais Pro/Scale você converte, mais previsível (MRR) e maior ARPU.

## Bookmark da implementação

- `src/config/plans.js` — definição
- Migration `032_pricing_v2.sql` — addon_purchases
- `applyFeeToSale` lê plano do vendedor e aplica taxas
- `hold-period.applyHoldToSale` lê plano e aplica hold customizado
- `branding_required` no plano força "Powered by BotDash" nas mensagens do bot
