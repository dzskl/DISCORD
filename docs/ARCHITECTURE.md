# Arquitetura BotDash

## Estrutura de pastas

```
botdash/
├── src/
│   ├── config/             # Configurações (plans, rate-limits, session)
│   ├── controllers/        # Handlers HTTP (Express Routers)
│   ├── services/           # Business logic (bot, email, audit, misticpay)
│   ├── repositories/       # Camada de acesso a dados
│   │   ├── interfaces/     # Contratos
│   │   └── implementations/
│   ├── models/             # Definições de schema das tabelas
│   ├── routes/             # Registro centralizado de rotas
│   ├── middlewares/        # auth, error-handler, logging
│   ├── validators/         # Validações de payload
│   ├── utils/              # logger, encryption
│   ├── helpers/            # Funções utilitárias (formato, regex...)
│   ├── constants/          # Enums e magic values
│   ├── events/             # Event handlers (Discord bot)
│   ├── jobs/               # Cron jobs (scheduler)
│   ├── database/
│   │   ├── connection.js   # Setup do SQLite + helpers de credenciais
│   │   └── migrate.js      # Runner de migrations
│   ├── app.js              # Express app factory
│   └── server.js           # Entrypoint (boot + lifecycle)
├── database/
│   ├── migrations/         # Versionamento de schema (.sql)
│   └── seeds/              # Dados de exemplo (.sql)
├── public/                 # Arquivos estáticos (HTML/CSS/JS frontend)
├── infra/                  # Configs de infra (nginx.conf)
├── tests/                  # Testes (futuro)
├── docs/                   # Documentação
├── data/                   # SQLite + chave master (gitignored)
├── docker-compose.yml      # Setup de 1 nó (dev/staging)
├── docker-compose.production.yml  # Setup multi-nó com LB + cache + replica
└── Dockerfile
```

## Camadas (separation of concerns)

```
HTTP Request
    ↓
[middlewares]      auth, rate-limit, logging
    ↓
[controllers]      validam request, chamam services
    ↓
[services]         business logic, transações
    ↓
[repositories]     queries SQL encapsuladas
    ↓
[database]         SQLite (dev) / Postgres (prod)
```

## Arquitetura escalável (produção)

```
                    ┌──────────────┐
                    │   Cloudflare │  (HTTPS + CDN + DDoS)
                    └──────┬───────┘
                           ↓
                  ┌────────────────┐
                  │ Nginx LB       │  (rate limit, distribute)
                  └────┬──────┬────┘
                       ↓      ↓
                  ┌────────┐ ┌────────┐
                  │ App 1  │ │ App 2  │  (stateless, escalável horizontal)
                  └───┬────┘ └───┬────┘
                      ↓          ↓
                  ┌─────────────────┐
                  │ Redis cache     │  (config, plans, sessões)
                  └─────────────────┘
                      ↓          ↓
                  ┌────────┐ ┌────────┐
                  │ Master │ │ Slave  │  (Postgres com replication)
                  └────────┘ └────────┘
```

## Fluxo de uma requisição típica (POST /api/products)

1. **Nginx** → recebe HTTPS, aplica rate limit por IP, encaminha pra app1 ou app2
2. **logging.middleware** → loga request com pino-http
3. **rate-limits** → limite global de 120/min, específicos para endpoints sensíveis
4. **session middleware** → carrega sessão SQLite
5. **auth.middleware (loadUser)** → resolve `req.appUser`
6. **routes/index.js** → roteia pro controller correto
7. **products.controller** → `requireAuth` checa permissão, valida payload
8. **plans.js** → checa `withinLimit('max_products', count)` — pode retornar 402
9. **products.repository** → grava no banco
10. **audit.service** → registra ação no audit_log
11. **error-handler** → captura qualquer throw e responde JSON sanitizado

## Convenções

- **Controllers** retornam `Router` do Express, são "thin"
- **Services** não conhecem HTTP (sem req/res)
- **Repositories** só sabem SQL, sem regras de negócio
- **Helpers** são puros (sem side effects)
- **Constants** são imutáveis

## Migrations

```bash
npm run migrate    # aplica .sql novos em database/migrations/
npm run seed       # popula dados de demo
```

Para adicionar uma migration:
1. Crie `database/migrations/002_seu_nome.sql`
2. Use `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ADD COLUMN`
3. Sempre idempotente
4. `npm run migrate` registra na tabela `_migrations`

## Deploy em produção

```bash
docker compose -f docker-compose.production.yml up -d
```

Variáveis obrigatórias no `.env`:
- `SESSION_SECRET` (32+ chars random)
- `PUBLIC_URL` (https://seu-dominio.com)
- `NODE_ENV=production`

Variáveis opcionais (podem ser setadas pela UI também):
- Discord, Stripe, MisticPay, Resend, etc.
