// Tests dos planos — free/pro features e limites, per-guild + per-owner.

const { applyMigrations } = require('../src/database/migrate');
const { db } = require('../src/database/connection');
const plans = require('../src/config/plans');

applyMigrations();

test('PLAN free tem limites', () => {
  const p = plans.getPlan('free');
  assertEq(p.features.max_products, 10);
  assertEq(p.features.autoreply, false);
  assertEq(p.commission_rate, 0, 'pricing v3: sem comissao');
  assertEq(p.branding_required, true);
});

test('PLAN pro libera tudo', () => {
  const p = plans.getPlan('pro');
  assertEq(p.features.max_products, Infinity);
  assertEq(p.features.autoreply, true);
  assertEq(p.commission_rate, 0, 'pricing v3: sem comissao');
  assertEq(p.features.crypto_checkout, true, 'pro libera cripto');
});

test('PLAN starter existe', () => {
  const p = plans.getPlan('starter');
  assertEq(p.id, 'starter');
  assertEq(p.commission_rate, 0);
  assertEq(p.price_monthly_brl, 29);
});

test('PLAN scale existe', () => {
  const p = plans.getPlan('scale');
  assertEq(p.id, 'scale');
  assertEq(p.commission_rate, 0);
  assertEq(p.features.white_label, true);
});

test('withinLimit respeita limite', () => {
  assertEq(plans.withinLimit('max_products', 0), true);
  assertEq(plans.withinLimit('max_products', 10), false);
});

test('guildPlan retorna plano da guild ativa', () => {
  db.prepare(`INSERT INTO guilds (id, name, plan, subscription_status) VALUES ('g1', 'G1', 'pro', 'active')`).run();
  const p = plans.guildPlan('g1');
  assertEq(p.id, 'pro');
});

test('planFor(req) usa guildId', () => {
  const fakeReq = { guildId: 'g1' };
  const p = plans.planFor(fakeReq);
  assertEq(p.id, 'pro');
});

test('guild com trial expirado vira free', () => {
  db.prepare(`INSERT INTO guilds (id, name, plan, subscription_status, subscription_ends_at) VALUES ('g2', 'G2', 'pro', 'expired', ?)`).run(Math.floor(Date.now()/1000) - 100);
  const p = plans.guildPlan('g2');
  assertEq(p.id, 'free');
  assertEq(p.expired_from, 'pro');
});
