# Deploy no Railway — guia rápido

## ⚠️ Problema crítico: sessões somem a cada deploy

Por padrão o Railway recria o container a cada deploy. Como o SQLite vive em `/app/data` **dentro do container**, ele é destruído junto. Resultado:
- Todos os usuários deslogam
- Produtos, vendas, configurações desaparecem
- Trial Pro reseta

**Solução: adicionar um Volume persistente.**

## Passo a passo

### 1. Adicionar Volume

No Railway:
1. Abre o projeto → seu service (DISCORD)
2. **Settings** → desce até **Volumes**
3. Clica **+ New Volume**
4. **Mount path**: `/app/data`
5. Salva

Pronto. Próximo deploy mantém `botdash.sqlite`, `sessions.sqlite` e a chave master de encriptação.

### 2. Variáveis de ambiente obrigatórias

Em **Variables**:

```env
NODE_ENV=production
SESSION_SECRET=cole-aqui-uma-string-aleatoria-de-32+-caracteres
PUBLIC_URL=https://seu-dominio.up.railway.app
```

Pra gerar um `SESSION_SECRET` forte:
```bash
openssl rand -hex 32
```

⚠️ **Não mude `SESSION_SECRET` depois de configurar** — se mudar, todas as sessões existentes ficam inválidas (todo mundo desloga).

### 3. Variáveis opcionais (podem ser preenchidas pelo painel depois)

Discord, Stripe, MisticPay, Resend — tudo isso pode ser configurado pelo cliente final via a aba **Credenciais** no painel. Mas se quiser pré-configurar:

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_GUILD_ID=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

### 4. Verificar se sessões estão persistindo

Após deploy, acesse:
```
https://seu-dominio.up.railway.app/api/session/health
```

Resposta esperada quando está OK:
```json
{
  "session_secret": { "set": true, "length": 64, "strong": true },
  "session_storage": { "will_survive_deploy": true },
  "advice": ["tudo OK"]
}
```

Se `will_survive_deploy` mostrar string de aviso, é porque o Volume não está montado.

## Custos

- App service: ~$5-10/mês conforme uso (Hobby plan)
- Volume 1GB: ~$0.25/mês
- Total: ~$5/mês pra começar

## Webhooks Stripe

Após deploy, configure os webhooks no [dashboard Stripe](https://dashboard.stripe.com/webhooks):

| Endpoint | Eventos |
|---|---|
| `https://seu-dominio/api/checkout/webhook` | `checkout.session.completed`, `charge.refunded` |
| `https://seu-dominio/api/billing/webhook` | `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` |

Cole os signing secrets em **Credenciais → Stripe/Billing** no painel.

## Discord OAuth

No [Developer Portal](https://discord.com/developers/applications) → OAuth2 → Redirects, adicione:
```
https://seu-dominio.up.railway.app/auth/discord/callback
```

## Migrations

Aplicadas automaticamente no boot pelo `applyMigrations()` em `src/server.js`. Não precisa rodar nada manual.

## Diagnóstico rápido

| Sintoma | Causa | Solução |
|---|---|---|
| Logout após deploy | Sem volume em `/app/data` | Adicionar Volume |
| Logout após 30min | `SESSION_SECRET` ausente/fraco | Setar string de 32+ chars |
| Bot não loga no Discord | `DISCORD_TOKEN` errado | Conferir em /setup.html |
| Webhook Stripe não chega | Domínio errado no Stripe | Atualizar endpoint do webhook |
| `redirect_uri inválido` no OAuth | `PUBLIC_URL` ≠ Discord redirect | Conferir match exato |
