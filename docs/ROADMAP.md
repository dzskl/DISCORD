# Roadmap operacional

## Fase 1 — Beta Lançamento (mês 0–2)
**Goal: 20–50 vendedores reais usando o sistema diariamente.**

### Tech (já entregue ✅)
- ✅ Sentry-ready + logs estruturados
- ✅ Tests mínimos das rotinas fintech (29 testes, ledger zera, fee correto)
- ✅ CI básico (.github/workflows/ci.yml)
- ✅ Backup automatizado (scripts/backup.js + cron sugerido 1/h)
- ✅ Pricing v2 (Free/Starter/Pro/Scale)
- ✅ Lock-in: Reviews + BotDash Points + Referrals camada B
- ✅ Ledger double-entry
- ✅ Webhook DLQ + retry
- ✅ Rate limit por tenant

### Tech (a fazer)
- [ ] `npm i @sentry/node pino-pretty` em prod e ativar SENTRY_DSN
- [ ] Onboarding wizard de 5 passos (Discord OAuth → cria 1ª loja em <10min)
- [ ] 3 templates de loja prontos (curso, comunidade VIP, serviço)
- [ ] Tutorial em vídeo de 5 min
- [ ] Migration helper: importar produtos de Hotmart (CSV parser)

### Marketing
- [ ] Lista de 200 servidores Discord BR ativos com cargos VIP/pagos
- [ ] 50 outreach DMs personalizadas
- [ ] 30 vídeos TikTok/Reels curtos ("ganhei X vendendo Y no Discord")
- [ ] 5 parcerias com criadores médios (10k+ subs)
- [ ] Setup grátis nas 100 primeiras contas

## Fase 2 — 100 vendedores (mês 2–6)
**Goal: R$ 10k MRR + estabilizar churn < 10%.**

### Tech
- [ ] Redis + BullMQ (entregas e webhooks viram async)
- [ ] Funnel Builder MVP (drag-drop de gatilhos pós-venda)
- [ ] BaaS integration (Iugu/Asaas) — sai da custódia direta
- [ ] Domínio próprio (Pro+) implementado
- [ ] Marketplace de templates
- [ ] Programa de afiliados da plataforma — landing pública

### Produto
- [ ] Cashback BotDash Points consumindo (pagar mensalidade com pontos)
- [ ] Reviews aparecem na loja pública + Discord embed
- [ ] Selo "Top Seller" automático (10+ reviews, avg 4.5)

### Marketing
- [ ] Comunidade Discord própria
- [ ] SEO: 20 artigos longos ("como vender no Discord", "alternativa Hotmart")
- [ ] Caso de sucesso filmado (1 vendedor faturando 10k+)

## Fase 3 — 1.000 vendedores (mês 6–12)
**Goal: R$ 100k MRR.**

### Tech
- [ ] Migração SQLite → Postgres (ver MIGRATION_POSTGRES.md)
- [ ] Sessions pra Redis
- [ ] Materialized views (balanceFor escala)
- [ ] KYC real via Idwall/Unico
- [ ] Telegram bot (primeira versão)
- [ ] API pública v1 + rate limit por plano

### Produto
- [ ] Diretório público de vendedores (SEO)
- [ ] Migration tool oficial (importar Hotmart/Kiwify)
- [ ] Email transacional com domínio próprio
- [ ] White-label parcial (Pro+)

### Marketing
- [ ] Ads pagos (YouTube, IG) — CAC alvo R$ 30–80/trial
- [ ] Patrocínio criadores grandes
- [ ] Programa de embaixadores

## Fase 4 — 10.000 vendedores (ano 2)
**Goal: R$ 1M MRR.**

### Tech
- [ ] Discord sharding (gateway service separado)
- [ ] Postgres read replicas
- [ ] Marketplace unificado opcional (checkout próprio)
- [ ] Recomendações por ML
- [ ] Multi-region (latência fora do BR)

### Produto
- [ ] Account managers humanos pra Scale+
- [ ] SLAs contratuais 99,9%
- [ ] M&A: comprar concorrente menor pra absorver base

## Fase 5 — Internacional (ano 3+)
**Goal: R$ 10M+ MRR.**

### Tech
- [ ] Stripe Connect global
- [ ] Multi-currency, multi-language
- [ ] Compliance GDPR + PCI
- [ ] Mercado Pago, OXXO, PayPal locais

### Marketing
- [ ] Time comercial enterprise
- [ ] Eventos próprios

## Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| BACEN notificar antes de migrar pra BaaS | Média | Alto | Acelerar BAAS_INTEGRATION pra Fase 2 |
| Discord banir o bot | Baixa | Crítico | Telegram diversificação Fase 3 |
| Concorrente copia features | Alta | Médio | Foco em lock-in (reviews, points, audiência) |
| SQLite trava em escala | Alta | Médio | Migração Postgres na Fase 3 |
| Vendedor abusivo derruba a plataforma | Média | Médio | Rate limit per-tenant (✅ implementado) |
| Chargeback massivo | Baixa | Alto | Reserva 5% + insurance addon |

## Métricas-norte (review semanal)

- **MRR e ARPU** por plano
- **Churn rate** (free → inativo, pago → cancelado)
- **GMV** (volume passando pela plataforma)
- **Take rate** efetivo (revenue / GMV)
- **DAU/MAU** de vendedores
- **NPS** de vendedores (mensal)
- **Saques pendentes** (operacional)
- **Webhook DLQ exhausted** (saúde)
