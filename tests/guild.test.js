// Tests do guild.service — upsert, link, trial inicial.

const { applyMigrations } = require('../src/database/migrate');
const { db } = require('../src/database/connection');
const guildSvc = require('../src/services/guild.service');

applyMigrations();

test('upsert cria guild com trial Pro de 7d', () => {
  const g = guildSvc.upsertGuild({ id: '111', name: 'Test Guild', icon_url: null, owner_discord_id: '999' });
  assertEq(g.plan, 'pro');
  assertEq(g.subscription_status, 'trialing');
  assert(g.trial_ends_at > Math.floor(Date.now() / 1000), 'trial_ends_at deve estar no futuro');
});

test('upsert idempotente — nao reinicia trial', () => {
  const before = guildSvc.findGuild('111');
  const after = guildSvc.upsertGuild({ id: '111', name: 'Test Guild Renamed', icon_url: null, owner_discord_id: '999' });
  assertEq(after.trial_ends_at, before.trial_ends_at);
  assertEq(after.name, 'Test Guild Renamed');
});

test('linkUserToGuild + listUserGuilds', () => {
  db.prepare(`INSERT INTO users (email, role, active) VALUES ('u@x.com', 'owner', 1)`).run();
  const userId = db.prepare(`SELECT id FROM users WHERE email='u@x.com'`).get().id;
  guildSvc.linkUserToGuild(userId, '111', 'owner');
  const list = guildSvc.listUserGuilds(userId);
  assertEq(list.length, 1);
  assertEq(list[0].id, '111');
  assertEq(list[0].user_role, 'owner');
});

test('markGuildLeft desativa guild', () => {
  guildSvc.markGuildLeft('111');
  const g = guildSvc.findGuild('111');
  assertEq(g.active, 0);
  assert(g.bot_left_at > 0);
});
