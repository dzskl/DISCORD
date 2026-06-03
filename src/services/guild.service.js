// Service de guilds: registro de servidores Discord como tenants
const { db, getCredential } = require('../database/connection');
const logger = require('../utils/logger');

function upsertGuild({ id, name, icon_url, owner_discord_id }) {
  const existing = db.prepare('SELECT id FROM guilds WHERE id=?').get(id);
  // Nova guild ganha trial Pro de 7d na primeira vez
  const trialEndsAt = existing ? null : Math.floor(Date.now() / 1000) + 7 * 86400;
  db.prepare(`
    INSERT INTO guilds (id, name, icon_url, owner_discord_id, active, plan, subscription_status, trial_ends_at, subscription_ends_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      icon_url = excluded.icon_url,
      owner_discord_id = COALESCE(excluded.owner_discord_id, guilds.owner_discord_id),
      active = 1,
      bot_left_at = NULL
  `).run(
    id, name, icon_url || null, owner_discord_id || null,
    existing ? 'free' : 'pro',
    existing ? null : 'trialing',
    trialEndsAt,
    trialEndsAt
  );
  return db.prepare('SELECT * FROM guilds WHERE id=?').get(id);
}

function markGuildLeft(guildId) {
  db.prepare(`UPDATE guilds SET active=0, bot_left_at=strftime('%s','now') WHERE id=?`).run(guildId);
}

function listGuilds() {
  return db.prepare('SELECT * FROM guilds WHERE active=1 ORDER BY name').all();
}

function findGuild(id) {
  return db.prepare('SELECT * FROM guilds WHERE id=?').get(id);
}

function listUserGuilds(userId) {
  return db.prepare(`
    SELECT g.*, ug.role AS user_role
    FROM user_guilds ug
    JOIN guilds g ON g.id = ug.guild_id
    WHERE ug.user_id = ? AND g.active = 1
    ORDER BY g.name
  `).all(userId);
}

function linkUserToGuild(userId, guildId, role = 'admin') {
  db.prepare(`
    INSERT INTO user_guilds (user_id, guild_id, role)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET role = excluded.role
  `).run(userId, guildId, role);
}

function userHasGuildAccess(userId, guildId) {
  const row = db.prepare('SELECT 1 FROM user_guilds WHERE user_id=? AND guild_id=?').get(userId, guildId);
  return !!row;
}

// Backfill: se houver DISCORD_GUILD_ID no credentials e nao houver guild
// registrada, cria uma "legacy" pra preservar dados antigos
function backfillLegacyGuild() {
  const legacyId = getCredential('DISCORD_GUILD_ID');
  if (!legacyId) return;
  const existing = findGuild(legacyId);
  if (existing) return;

  upsertGuild({
    id: legacyId,
    name: 'Servidor Principal',
    icon_url: null,
    owner_discord_id: null
  });
  logger.info({ guild_id: legacyId }, 'guild legacy criada via backfill');

  // Backfill: marca todos os rows sem guild_id com a legacy
  const tables = [
    'products', 'sales', 'logs', 'mod_actions', 'announcements',
    'member_events', 'command_usage', 'coupons', 'auto_replies',
    'wishlist', 'tickets', 'stock_log', 'categories', 'giveaways',
    'affiliates', 'invites_log', 'audit_log'
  ];
  for (const t of tables) {
    try {
      const r = db.prepare(`UPDATE ${t} SET guild_id=? WHERE guild_id IS NULL`).run(legacyId);
      if (r.changes > 0) logger.info({ table: t, rows: r.changes }, 'backfilled guild_id');
    } catch (e) {
      logger.debug({ err: e.message, table: t }, 'skip backfill');
    }
  }

  // Vincula o owner se houver users com role=owner
  const owner = db.prepare(`SELECT id FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1`).get();
  if (owner) linkUserToGuild(owner.id, legacyId, 'owner');
}

module.exports = {
  upsertGuild,
  markGuildLeft,
  listGuilds,
  findGuild,
  listUserGuilds,
  linkUserToGuild,
  userHasGuildAccess,
  backfillLegacyGuild
};
