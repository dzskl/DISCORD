// Planos do SaaS — pricing v2 (4 tiers).
// Owner = vendedor. Cada plano define comissao, taxa fixa, hold, features e limites.

const PLANS = {
  trial_24h: {
    id: 'trial_24h',
    name: 'Trial 24h',
    price_monthly_brl: 0,
    description: 'tudo liberado por 24h pra testar',
    duration_hours: 24,
    commission_rate: 0.039,        // mesmo que Pro no trial
    fixed_fee_cents: 99,
    branding_required: false,
    advance_fee_rate: 0.0199,
    hold_days_override: 2,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: true, multi_bot: false, white_label: false
    }
  },

  free: {
    id: 'free',
    name: 'Free',
    price_monthly_brl: 0,
    description: 'pra testar e operar pequeno',
    commission_rate: 0.079,        // 7,9%
    fixed_fee_cents: 149,           // R$ 1,49
    branding_required: true,        // "Powered by BotDash" obrigatorio
    advance_fee_rate: 0.0299,
    hold_days_new: 14,
    hold_days_established: 14,      // free sempre D+14
    withdraw_min_cents: 5000,
    features: {
      max_products: 10,
      max_coupons: 3,
      max_affiliates: 0,
      max_giveaways_active: 1,
      autoreply: false, tickets: true, manual_delivery: false,
      stripe_checkout: true, misticpay_checkout: true,
      custom_branding: false, daily_report: true, audit_log: false,
      api_webhooks: false, multi_bot: false, white_label: false
    }
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    price_monthly_brl: 47,
    description: 'pra quem vende R$ 1k-5k/mes',
    commission_rate: 0.059,        // 5,9%
    fixed_fee_cents: 149,
    branding_required: false,
    advance_fee_rate: 0.0249,
    hold_days_new: 7,
    hold_days_established: 2,
    withdraw_min_cents: 3000,
    includes_verified_badge: true,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: 5,
      max_giveaways_active: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: false, multi_bot: false, white_label: false
    }
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    price_monthly_brl: 97,
    description: 'pra vendedor serio escalando',
    commission_rate: 0.039,        // 3,9%
    fixed_fee_cents: 99,
    branding_required: false,
    advance_fee_rate: 0.0199,
    hold_days_new: 2,
    hold_days_established: 2,
    withdraw_min_cents: 1000,
    includes_verified_badge: true,
    includes_featured_slots: 1,
    multi_bot_limit: 3,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: true, multi_bot: true, white_label: false
    }
  },

  scale: {
    id: 'scale',
    name: 'Scale',
    price_monthly_brl: 297,
    description: 'enterprise leve — alta margem, account manager',
    commission_rate: 0.029,        // 2,9%
    fixed_fee_cents: 49,
    branding_required: false,
    advance_fee_rate: 0.0149,
    hold_days_new: 1,
    hold_days_established: 1,
    withdraw_min_cents: 500,
    includes_verified_badge: true,
    includes_featured_slots: 3,
    multi_bot_limit: Infinity,
    sla_99_9: true,
    features: {
      max_products: Infinity,
      max_coupons: Infinity,
      max_affiliates: Infinity,
      max_giveaways_active: Infinity,
      autoreply: true, tickets: true, manual_delivery: true,
      stripe_checkout: true, misticpay_checkout: true,
      custom_branding: true, daily_report: true, audit_log: true,
      api_webhooks: true, multi_bot: true, white_label: true
    }
  }
};

const ADDONS = {
  domain:        { id: 'domain',        label: 'Dominio proprio',     price_monthly_cents: 2900, applies_to: ['starter','pro','scale'] },
  webhooks:      { id: 'webhooks',      label: 'Webhooks avancados',  price_monthly_cents: 1900, applies_to: ['starter','pro','scale'] },
  emails:        { id: 'emails',        label: 'Emails transacionais',price_monthly_cents: 1900, applies_to: ['starter','pro','scale'] },
  insurance:     { id: 'insurance',     label: 'Insurance chargeback',price_monthly_cents: 4900, applies_to: ['pro','scale'] },
  setup_helper:  { id: 'setup_helper',  label: 'Setup assistido 1h',  one_time_cents: 29700, applies_to: ['*'] },
  migration:     { id: 'migration',     label: 'Migracao de plataforma',one_time_cents: 49700, applies_to: ['*'] }
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
