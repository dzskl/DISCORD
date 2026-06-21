# Migração SQLite → Postgres

Quando: ao bater **~1.000 vendedores ativos** com vendas regulares.
Por quê: SQLite WAL é single-writer; concorrência de webhooks + reconciliação + UI degrada > 50 writes/s sustentados.

## Provedor recomendado

- **Neon** (postgres serverless): free tier 3 GB + branch read-replicas, mais barato pra começar
- **Supabase**: caro mas tem dashboard bom
- **Railway Postgres**: mesma plataforma, latência mínima
- **Crunchy / RDS**: enterprise

Recomendação: **Neon** até ~10k vendedores, depois Railway/Crunchy.

## Estratégia: zero-downtime via dual-write

### Fase 1 — Preparar (1 semana)

1. Trocar `better-sqlite3` por `pg` em uma camada de abstração (`src/database/connection.js` vira um router).
2. Reescrever queries SQLite-specific:
   - `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`
   - `strftime('%s','now')` → `EXTRACT(EPOCH FROM NOW())`
   - SQLite implicit transactions → `BEGIN/COMMIT` explícito
   - `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL` ou `BIGINT GENERATED ALWAYS AS IDENTITY`
3. Migrations: usar `node-pg-migrate` ou converter os SQLs manualmente. Cada arquivo `database/migrations/0XX_*.sql` precisa ser dual-compatible (ou fork pra `postgres-migrations/`).
4. Testes contra Postgres local em CI (docker-compose).

### Fase 2 — Dual-write (3 dias)

1. Configurar Postgres em prod (vazio).
2. Toda escrita vai pros dois bancos (SQLite original como autoritativo, Postgres replica).
3. Validar consistência diariamente (cron compara contagens + hash de tabelas críticas).

### Fase 3 — Switchover (1 dia)

1. Snapshot do SQLite.
2. `pgloader sqlite://botdash.sqlite postgresql://...` (migração completa).
3. Stop writes 10 min, reconcilia delta.
4. Atomic switch: env var `DATABASE_URL` aponta pro Postgres.
5. Postgres vira autoritativo.

### Fase 4 — Limpeza (1 semana)

1. Remove dual-write.
2. Adiciona index e materialized views (saldo por user).
3. Read replica pra dashboard.

## Schema changes pra aproveitar Postgres

- `JSON` → `JSONB` (audit_log details, sale.cart_items)
- `TEXT NOT NULL CHECK(status IN ...)` → tipos ENUM
- Adicionar indexes parciais: `WHERE status = 'paid'`, `WHERE active = 1`
- Particionamento de `sales` por mês quando passar de 10M registros
- `created_at` indexável (DESC) com BRIN ou btree

## Materialized views críticas

```sql
CREATE MATERIALIZED VIEW user_balance AS
SELECT
  ug.user_id,
  COALESCE(SUM(s.net_to_owner_cents) FILTER (WHERE s.available_at <= NOW()), 0) AS available,
  COALESCE(SUM(s.net_to_owner_cents) FILTER (WHERE s.available_at > NOW()), 0) AS pending
FROM user_guilds ug
LEFT JOIN sales s ON s.guild_id = ug.guild_id AND s.status = 'paid'
WHERE ug.role = 'owner'
GROUP BY ug.user_id;

REFRESH MATERIALIZED VIEW CONCURRENTLY user_balance; -- via cron 1min
```

`balanceFor` consulta a view em vez de agregar on-the-fly.

## Estimativa de tempo

- **Fase 1 (preparar):** 1-2 semanas dev
- **Fase 2 (dual-write):** 3-5 dias
- **Fase 3 (switchover):** 1 dia + janela de manutenção
- **Total real:** ~3 semanas com testes

## Custo mensal estimado

- Neon free tier até 3GB, depois ~$19/mês
- Supabase $25/mês (db) + $0/extra
- RDS db.t3.small ~$30/mês
