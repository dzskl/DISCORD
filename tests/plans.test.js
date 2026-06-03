// Tests dos planos — free/pro features e limites, per-guild + per-owner.

const { applyMigrations } = require('../src/database/migrate');
const { db } = require('../src/database/connection');
const plans = require('../src/config/plans');

applyMigrations();

test('PLAN free tem limites', () => {
  const p = plans.getPlan('free');
  assertEq(p.features.max_products, 5);
  assertEq(p.features.autoreply, false);
});

test('PLAN pro libera tudo', () => {
  const p = plans.getPlan('pro');
  assertEq(p.features.max_products, Infinity);
  assertEq(p.features.autoreply, true);
});

test('withinLimit respeita limite', () => {
  // sem req → cai pra ownerPlan; sem owner → free
  assertEq(plans.withinLimit('max_products', 0), true);
  assertEq(plans.withinLimit('max_products', 5), false);
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
