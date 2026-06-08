# BotDash — Arquitetura

## Visão geral

BotDash é uma plataforma SaaS multi-tenant que transforma servidores Discord em lojas digitais. Cada vendedor configura um bot, cadastra produtos e vende via PIX automaticamente.

## Stack

- **Backend**: Node.js 22 + Express 4 + better-sqlite3
- **Bot**: discord.js 14 (single shard, vai shardar quando necessário)
- **Auth**: passport-discord + sessions SQLite (Redis-ready)
- **Pagamentos**: MysticPay (PIX) + Stripe (cartão)
- **Filas**: cron (`node-cron`) — vai migrar pra BullMQ + Redis em Fase 2
- **Observabilidade**: Pino estruturado + Sentry opcional + correlation IDs

## Estrutura de pastas

```
src/
├── server.js                # entrypoint (boot)
├── app.js                   # express app + middlewares
├── routes/index.js          # register de todas rotas
├── controllers/             # 1 controller = 1 router por dominio
├── services/                # logica reutilizavel (bot, mp, ledger, points, refs)
├── config/                  # plans, platform-fee, hold-period, etc
├── middlewares/             # auth, rate-limit, logging
├── jobs/                    # cron jobs (scheduler.js + workers)
├── database/                # connection + migrate + migrations
└── utils/                   # logger
public/                      # frontend estatico (app.html, admin/, loja.html)
database/migrations/         # 034+ migrations idempotentes
tests/                       # *.test.js (runner customizado em run.js)
scripts/backup.js            # backup online via SQLite backup API
docs/                        # esta pasta
```

## Multi-tenancy

Cada **guild Discord** é um tenant isolado. Tabelas têm `guild_id` filtrando todo SELECT. Modelo de relacionamento:

```
users (PK id, plan, is_super_admin)
   ↓ user_guilds (user_id, guild_id, role)
guilds (PK id = discord guild id)
   ↓ products / sales / logs / coupons / ... (com guild_id)
```

Um usuário pode ser owner/admin de N guilds. Saldo é por user (consolida vendas de todas as guilds dele).

## Fluxo de pagamento (MysticPay)

```
1. Frontend chama POST /api/checkout/pix/create
2. Server valida produto/estoque/cupom
3. Cria registro em `sales` com status='pending', stripe_session_id='mp:<txId>'
4. mp.createPixTransaction → retorna QR + brcode
5. Frontend faz polling em GET /status/:tx (ou espera webhook)
6. MysticPay envia POST /api/checkout/pix/webhook
   - Raw body preservado
   - HMAC validation (services/webhook-security)
   - Idempotency via UNIQUE(gateway, event_id) em webhook_events
   - Confirma na API MysticPay antes de aceitar (defense in depth)
   - markPaid: status, taxas, hold, cargos, DM, notificacao, points, referral
7. Caso webhook falhe: vai pra webhook_dlq, retry exponencial
8. Reconciliacao cron (*/30) cruza pending com API real
```

## Fluxo financeiro

### Receita por venda

Quando uma venda vira `paid`:
1. `platform-fee.applyFeeToSale` — aplica % + fixa do plano do vendedor
2. `hold-period.applyHoldToSale` — define `available_at` baseado em tier + plano
3. `points.awardForSale` — credita 1% do net em BotDash Points
4. `referrals.payCommissionFromSale` — 20% da fee plataforma vira pontos pro referrer (se houver)

### Saldo do vendedor

`wallet.balanceFor(userId, guildId)` calcula:
```
earned       = SUM(net_to_owner_cents) WHERE status='paid'
released     = SUM(net WHERE available_at <= NOW)
pending      = SUM(net WHERE available_at > NOW)
withdrawn    = SUM(withdrawals em pending/approved/paid)
reserve      = 5% das vendas dos ultimos 30d
advanceFees  = SUM(advance_requests.fee_cents)
featSpent    = SUM(featured pagos via saldo)
badgeSpent   = SUM(verified_badge pagos via saldo)
available    = released - withdrawn - reserve - advanceFees - featSpent - badgeSpent
```

### Ledger double-entry

`services/ledger.service.js` registra cada movimentação em 2+ entries que somam zero. Contas padronizadas:
- `user:{id}:available`
- `user:{id}:hold`
- `user:{id}:reserve`
- `platform:revenue`
- `platform:withdrawals`
- `external:gateway`

Hoje convive com o cálculo legado. Próximo passo: ledger vira source of truth.

## Webhooks

Cada webhook segue o protocolo:
1. **Raw body** (express.raw, não json) pra HMAC bater
2. **HMAC validation** (`services/webhook-security.verifyMisticPaySignature`)
3. **Dedup** via UNIQUE(gateway, event_id) na tabela `webhook_events`
4. **Processamento idempotente** (sale.status='paid' early-return)
5. **Marca status** processado/falho
6. **DLQ** em caso de erro (cron drena */5min)

## Autenticação

3 modos coexistem:
- **Email/senha** (bcrypt, session cookie)
- **Discord OAuth** (passport-discord, callback dinâmico por host)
- **Super-admin** allowlist (env + DB flag `is_super_admin`)

Painéis:
- `/app.html` — vendedores
- `/admin/` — super-admin only, login separado, gated no middleware estático

## Anti-fraude e KYC

- `fraud_score` em sales (regras de IP velocity, repeated buyer, etc)
- `user_verifications` (CPF/CNPJ + chave PIX) status pending_review/approved/rejected
- Hold escalonado D+14 novato / D+2 estabelecido (configurável por plano)
- Reserva rolante 5% dos últimos 30 dias
- 2FA TOTP obrigatório pra saques

## Observabilidade

- **Logs**: Pino JSON estruturado, redact de campos sensíveis
- **Correlation IDs**: x-request-id em toda request
- **Erros**: Sentry opcional, `logger.error` envia automático se SENTRY_DSN set
- **Rate limit violations**: persistidas em DB
- **Audit log**: toda mutação importante grava em `audit_log`

## Cron jobs

| Job | Frequência | Função |
|---|---|---|
| `runScheduledAnnouncements` | 1 min | Envia anúncios agendados |
| `endDueGiveaways` | 1 min | Encerra sorteios |
| `expireRoles` | 5 min | Remove cargos expirados |
| `runReconciliation` | 30 min | Cruza pending MysticPay |
| `runWebhookDlqDrain` | 5 min | Reprocessa DLQ |
| `sendExpiryWarnings` | 1h | Avisa expiração de acesso |
| `checkTrials` | 1h | Expira trials |
| `followUpAbandonedCarts` | 15 min | DM em cart abandonado |
| `rotateBotBios` | 1 min | Bio rotativa do bot |
| `runAutoWithdraw` | diário 09h BRT | Saque auto pra Pro+ |
| `expireFeaturedAndBadges` | diário 00h30 | Limpa featured expirado |
| `generateReviewInvites` | diário 10h | Manda DM D+7 da compra |
| `maybeSendDailyReport` | 1h (com guard) | Relatório diário owner |

## Escala — limites e mitigações

| Escala | Limite atual | Mitigação |
|---|---|---|
| **~1k vendedores** | SQLite WAL handles writes ok | Manter |
| **1k-10k** | SQLite começa a sentir, balanceFor lento | **Migrar pra Postgres** + materialized views |
| **10k+** | Discord shards obrigatório | Separar bot gateway em service |
| **100k+** | Multi-region | Read replicas, CDN edge, KYC distribuído |

Documentação separada:
- [MIGRATION_POSTGRES.md](./MIGRATION_POSTGRES.md) — plano de migração SQLite → Postgres
- [BAAS_INTEGRATION.md](./BAAS_INTEGRATION.md) — sair da custódia direta de dinheiro
- [RAILWAY.md](./RAILWAY.md) — deploy
