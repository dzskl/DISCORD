// Planos do SaaS — pricing v3 (intermediario, sem custodia).
//
// MODELO: BotDash nao toca em dinheiro. O vendedor conecta a propria PSP
// (MercadoPago, PushinPay, Stripe, Asaas, NOWPayments, etc.) e recebe direto
// na conta dele. BotDash cobra so mensalidade pelo bot + features.
//
// commission_rate e fixed_fee_cents ficam ZERADOS (compat com platform-fee.js
// e codigo legado — quando 0, nenhum desconto eh aplicado na venda).

const PLANS = {
  trial_24h: {
    id: 'trial_24h',
    name: 'Trial 24h',
    price_monthly_brl: 0,
    description: 'tudo liberado por 24h pra testar',
    duration_hours: 24,
    commission_rate: 0,
    fixed_fee_cents: 0,
    branding_required: false,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      max_sales_month: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      mercadopago_checkout: true, pushinpay_checkout: true,
      asaas_checkout: true, crypto_checkout: true,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: true, multi_bot: false, white_label: false
    }
  },

  free: {
    id: 'free',
    name: 'Free',
    price_monthly_brl: 0,
    description: 'pra testar e operar pequeno',
    commission_rate: 0,
    fixed_fee_cents: 0,
    branding_required: true,                // "Powered by BotDash" obrigatorio
    features: {
      max_products: 10,
      max_coupons: 3,
      max_affiliates: 0,
      max_giveaways_active: 1,
      max_sales_month: 30,                  // limite gentil pra forcar upgrade
      autoreply: false, tickets: true, manual_delivery: false,
      // gateways: free so com PIX nacional (MP/PushinPay)
      stripe_checkout: false, misticpay_checkout: true,
      mercadopago_checkout: true, pushinpay_checkout: true,
      asaas_checkout: false, crypto_checkout: false,
      custom_branding: false, daily_report: true, audit_log: false,
      api_webhooks: false, multi_bot: false, white_label: false
    }
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    price_monthly_brl: 29,
    description: 'pra quem vende ate ~R$ 5k/mes',
    commission_rate: 0,
    fixed_fee_cents: 0,
    branding_required: false,
    includes_verified_badge: true,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: 5,
      max_giveaways_active: Infinity,
      max_sales_month: 300,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      mercadopago_checkout: true, pushinpay_checkout: true,
      asaas_checkout: true, crypto_checkout: false,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: false, multi_bot: false, white_label: false
    }
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    price_monthly_brl: 79,
    description: 'pra vendedor serio escalando',
    commission_rate: 0,
    fixed_fee_cents: 0,
    branding_required: false,
    includes_verified_badge: true,
    includes_featured_slots: 1,
    multi_bot_limit: 3,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      max_sales_month: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      mercadopago_checkout: true, pushinpay_checkout: true,
      asaas_checkout: true, crypto_checkout: true,   // cripto liberado no Pro
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: true, multi_bot: true, white_label: false
    }
  },

  scale: {
    id: 'scale',
    name: 'Scale',
    price_monthly_brl: 199,
    description: 'enterprise leve — white-label + account manager',
    commission_rate: 0,
    fixed_fee_cents: 0,
    branding_required: false,
    includes_verified_badge: true,
    includes_featured_slots: 3,
    multi_bot_limit: Infinity,
    sla_99_9: true,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      max_sales_month: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      mercadopago_checkout: true, pushinpay_checkout: true,
      asaas_checkout: true, crypto_checkout: true,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: true, multi_bot: true, white_label: true
    }
  }
};

const ADDONS = {
  domain:        { id: 'domain',        label: 'Dominio proprio',     price_monthly_cents: 1900, applies_to: ['starter','pro','scale'] },
  webhooks:      { id: 'webhooks',      label: 'Webhooks avancados',  price_monthly_cents: 1900, applies_to: ['starter','pro','scale'] },
  emails:        { id: 'emails',        label: 'Emails transacionais',price_monthly_cents: 1900, applies_to: ['starter','pro','scale'] },
  setup_helper:  { id: 'setup_helper',  label: 'Setup assistido 1h',  one_time_cents: 19700, applies_to: ['*'] },
  migration:     { id: 'migration',     label: 'Migracao de plataforma',one_time_cents: 39700, applies_to: ['*'] }
};

function getPlan(id) { return PLANS[id] || PLANS.free; }

function serializePlan(plan) {
  const features = {};
  for (const [k, v] of Object.entries(plan.features || {})) {
    features[k] = v === Infinity ? -1 : v;
  }
  return { ...plan, features };
}

function ownerPlan() {
  const { db } = require('../database/connection');
  const owner = db.prepare("SELECT plan, subscription_status, subscription_ends_at, trial_ends_at FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1").get();
  if (!owner) return getPlan('free');
  if (owner.plan !== 'free' && owner.subscription_ends_at && owner.subscription_ends_at < Math.floor(Date.now() / 1000)) {
    if (owner.subscription_status !== 'active' && owner.subscription_status !== 'trialing') {
      return { ...getPlan('free'), expired_from: owner.plan };
    }
  }
  return getPlan(owner.plan || 'free');
}

function guildPlan(guildId) {
  if (!guildId) return ownerPlan();
  const { db } = require('../database/connection');
  const g = db.prepare('SELECT plan, subscription_status, subscription_ends_at, trial_ends_at FROM guilds WHERE id=?').get(guildId);
  if (!g) return ownerPlan();
  if (g.plan !== 'free' && g.subscription_ends_at && g.subscription_ends_at < Math.floor(Date.now() / 1000)) {
    if (g.subscription_status !== 'active' && g.subscription_status !== 'trialing') {
      return { ...getPlan('free'), expired_from: g.plan };
    }
  }
  return getPlan(g.plan || 'free');
}

function planFor(req) { return req?.guildId ? guildPlan(req.guildId) : ownerPlan(); }
function hasFeature(feature, req) { return !!planFor(req).features[feature]; }
function withinLimit(feature, currentCount, req) {
  const limit = planFor(req).features[feature];
  if (limit === Infinity || limit === -1) return true;
  return currentCount < limit;
}

function requireFeature(feature) {
  return (req, res, next) => {
    if (!hasFeature(feature, req)) return res.status(402).json({ error: 'feature do plano superior', upgrade_required: true, feature });
    next();
  };
}

function requireLimit(feature, getCurrentCount) {
  return (req, res, next) => {
    const count = typeof getCurrentCount === 'function' ? getCurrentCount(req) : getCurrentCount;
    if (!withinLimit(feature, count, req)) {
      const limit = planFor(req).features[feature];
      return res.status(402).json({ error: `limite do plano atingido (${limit})`, upgrade_required: true, feature });
    }
    next();
  };
}

module.exports = { PLANS, ADDONS, getPlan, ownerPlan, guildPlan, planFor, hasFeature, withinLimit, requireFeature, requireLimit, serializePlan };
