const express = require('express');

const router = express.Router();

const PLACEHOLDER_SESSION = 'troque-isto-por-uma-string-aleatoria-longa';
const PLACEHOLDER_ADMIN = '';

function buildChecks() {
  const env = process.env;
  return {
    session: {
      key: 'SESSION_SECRET',
      label: 'Chave de sessão',
      ok: !!env.SESSION_SECRET && env.SESSION_SECRET.length >= 16 && env.SESSION_SECRET !== PLACEHOLDER_SESSION,
      required: true,
      auto: true,
      description: 'Uma string aleatória longa que assina os cookies de sessão.'
    },
    public_url: {
      key: 'PUBLIC_URL',
      label: 'URL pública',
      ok: !!env.PUBLIC_URL && env.PUBLIC_URL.startsWith('http') && !env.PUBLIC_URL.includes('localhost') === (env.NODE_ENV === 'production'),
      required: true,
      description: 'A URL onde o dashboard será acessado (ex: https://seubot.up.railway.app).'
    },
    discord_token: {
      key: 'DISCORD_TOKEN',
      label: 'Token do bot Discord',
      ok: !!env.DISCORD_TOKEN && env.DISCORD_TOKEN.length > 40,
      required: true,
      description: 'Token que autentica o bot. Cria em Discord Developer Portal → Bot → Reset Token.'
    },
    discord_client_id: {
      key: 'DISCORD_CLIENT_ID',
      label: 'Client ID',
      ok: !!env.DISCORD_CLIENT_ID && /^\d{15,25}$/.test(env.DISCORD_CLIENT_ID),
      required: true,
      description: 'ID da aplicação Discord. Está em OAuth2 → Client ID.'
    },
    discord_client_secret: {
      key: 'DISCORD_CLIENT_SECRET',
      label: 'Client Secret',
      ok: !!env.DISCORD_CLIENT_SECRET && env.DISCORD_CLIENT_SECRET.length > 20,
      required: true,
      description: 'Secret do OAuth (login no dashboard). Em OAuth2 → Reset Secret.'
    },
    discord_guild_id: {
      key: 'DISCORD_GUILD_ID',
      label: 'ID do servidor',
      ok: !!env.DISCORD_GUILD_ID && /^\d{15,25}$/.test(env.DISCORD_GUILD_ID),
      required: true,
      description: 'ID do servidor Discord onde o bot opera. Modo Desenvolvedor → botão direito no servidor → Copiar ID.'
    },
    admin_ids: {
      key: 'ADMIN_DISCORD_IDS',
      label: 'IDs de administradores',
      ok: !!env.ADMIN_DISCORD_IDS && env.ADMIN_DISCORD_IDS.length >= 15,
      required: true,
      description: 'Seu Discord ID (e de outros admins, separados por vírgula). Sem isso, qualquer um pode acessar.'
    },
    stripe_secret: {
      key: 'STRIPE_SECRET_KEY',
      label: 'Chave Stripe',
      ok: !!env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.startsWith('sk_'),
      required: false,
      description: 'Pra vender produtos. Pega em dashboard.stripe.com/apikeys.'
    },
    stripe_webhook: {
      key: 'STRIPE_WEBHOOK_SECRET',
      label: 'Webhook Stripe',
      ok: !!env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_'),
      required: false,
      description: 'Pra confirmar pagamentos. Cria webhook em dashboard.stripe.com/webhooks apontando para PUBLIC_URL/api/checkout/webhook.'
    },
    misticpay_client_id: {
      key: 'MISTICPAY_CLIENT_ID',
      label: 'MisticPay Client ID',
      ok: !!env.MISTICPAY_CLIENT_ID,
      required: false,
      description: 'Gateway PIX nacional (taxa menor que Stripe). Pega em misticpay.com → API → Credenciais.'
    },
    misticpay_client_secret: {
      key: 'MISTICPAY_CLIENT_SECRET',
      label: 'MisticPay Client Secret',
      ok: !!env.MISTICPAY_CLIENT_SECRET,
      required: false,
      description: 'Par do Client ID. Configure também o webhook em MisticPay apontando para PUBLIC_URL/api/checkout/pix/webhook.'
    }
  };
}

router.get('/status', (req, res) => {
  const checks = buildChecks();
  const list = Object.values(checks);
  const required = list.filter(c => c.required);
  const optional = list.filter(c => !c.required);
  const required_done = required.filter(c => c.ok).length;
  const optional_done = optional.filter(c => c.ok).length;
  const complete = required_done === required.length;
  const can_sell = checks.stripe_secret.ok && checks.stripe_webhook.ok;

  res.json({
    checks,
    required_done,
    required_total: required.length,
    optional_done,
    optional_total: optional.length,
    complete,
    can_sell,
    node_env: process.env.NODE_ENV || 'development'
  });
});

router.post('/test/discord', async (req, res) => {
  if (!process.env.DISCORD_TOKEN) return res.status(400).json({ error: 'DISCORD_TOKEN nao definido' });
  try {
    const r = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
    });
    if (!r.ok) return res.status(400).json({ error: 'token invalido ou sem permissao' });
    const bot = await r.json();
    let guild = null;
    if (process.env.DISCORD_GUILD_ID) {
      const g = await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
      });
      if (g.ok) guild = await g.json();
      else return res.status(400).json({ error: 'bot nao esta no servidor configurado (DISCORD_GUILD_ID)' });
    }
    res.json({ ok: true, bot: { username: bot.username, id: bot.id, avatar: bot.avatar }, guild: guild ? { name: guild.name, id: guild.id, members: guild.approximate_member_count } : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/test/misticpay', async (req, res) => {
  try {
    const mp = require('../services/misticpay');
    await mp.testConnection();
    res.json({ ok: true, gateway: 'MisticPay', message: 'credenciais validadas' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/test/stripe', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(400).json({ error: 'STRIPE_SECRET_KEY nao definido' });
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const account = await stripe.accounts.retrieve();
    res.json({
      ok: true,
      account: {
        id: account.id,
        country: account.country,
        email: account.email,
        charges_enabled: account.charges_enabled,
        default_currency: account.default_currency
      }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/test/oauth', (req, res) => {
  const url = process.env.PUBLIC_URL;
  const id = process.env.DISCORD_CLIENT_ID;
  if (!url || !id) return res.status(400).json({ error: 'PUBLIC_URL ou DISCORD_CLIENT_ID nao definido' });
  const callback = `${url}/auth/discord/callback`;
  res.json({
    ok: true,
    redirect_uri: callback,
    instruction: `Vá em Discord Developer Portal → OAuth2 → Redirects → adicione exatamente: ${callback}`
  });
});

module.exports = router;
