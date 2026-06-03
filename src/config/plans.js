// Definicao dos planos do SaaS.
// Owner = quem deve "pagar" pelo plano. Outros admins herdam o plano do owner.

const PLANS = {
  trial_24h: {
    id: 'trial_24h',
    name: 'Trial 24h',
    price_monthly_brl: 0,
    description: 'tudo liberado por 24h pra testar',
    duration_hours: 24,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      autoreply: true,
      tickets: true,
      manual_delivery: true,
      stripe_checkout: true,
      misticpay_checkout: true,
      custom_branding: true,
      daily_report: true,
      audit_log: true,
      api_webhooks: true
    }
  },
  free: {
    id: 'free',
    name: 'Free',
    price_monthly_brl: 0,
    description: 'pra testar e operar pequeno',
    features: {
      max_products: 5,
      max_coupons: 3,
      max_affiliates: 0,
      max_giveaways_active: 0,
      autoreply: false,
      tickets: true,
      manual_delivery: false,
      stripe_checkout: true,
      misticpay_checkout: false,
      custom_branding: false,
      daily_report: true,
      audit_log: false,
      api_webhooks: false
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_monthly_brl: 47,
    description: 'tudo liberado pra escalar',
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      autoreply: true,
      tickets: true,
      manual_delivery: true,
      stripe_checkout: true,
      misticpay_checkout: true,
      custom_branding: true,
      daily_report: true,
      audit_log: true,
      api_webhooks: true
    }
  }
};

function getPlan(id) {
  return PLANS[id] || PLANS.free;
}

// Serializa o plano (Infinity vira null no JSON, entao trocamos por -1 = ilimitado)
function serializePlan(plan) {
  const features = {};
  for (const [k, v] of Object.entries(plan.features)) {
    features[k] = v === Infinity ? -1 : v;
  }
  return { ...plan, features };
}

function ownerPlan() {
  const { db } = require('../database/connection');
  const owner = db.prepare("SELECT plan, subscription_status, subscription_ends_at, trial_ends_at FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1").get();
  if (!owner) return getPlan('free');

  // Plano expirou? volta pro free
  if (owner.plan !== 'free' && owner.subscription_ends_at && owner.subscription_ends_at < Math.floor(Date.now() / 1000)) {
    // sem grace period — em prod talvez convem dar 3 dias
    if (owner.subscription_status !== 'active' && owner.subscription_status !== 'trialing') {
      return { ...getPlan('free'), expired_from: owner.plan };
    }
  }
  return getPlan(owner.plan || 'free');
}

// Plano da guild ativa. Cai pra ownerPlan se sem guildId (compat).
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

function planFor(req) {
  return req?.guildId ? guildPlan(req.guildId) : ownerPlan();
}

function hasFeature(feature, req) {
  return !!planFor(req).features[feature];
}

function withinLimit(feature, currentCount, req) {
  const limit = planFor(req).features[feature];
  if (limit === Infinity) return true;
  return currentCount < limit;
}

function requireFeature(feature) {
  return (req, res, next) => {
    if (!hasFeature(feature, req)) {
      return res.status(402).json({ error: 'feature do plano Pro', upgrade_required: true, feature });
    }
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

module.exports = { PLANS, getPlan, ownerPlan, guildPlan, planFor, hasFeature, withinLimit, requireFeature, requireLimit, serializePlan };
