// Resolve qual guild o usuario esta atualmente gerenciando.
// Ordem: 1) header X-Guild-Id  2) session.active_guild_id  3) primeira do user
const guildService = require('../services/guild.service');

function resolveGuild(req, res, next) {
  if (!req.appUser) return next();

  let target =
    req.headers['x-guild-id'] ||
    req.query.guild_id ||
    req.session?.active_guild_id;

  const userGuilds = guildService.listUserGuilds(req.appUser.id);

  if (!target && userGuilds.length > 0) {
    target = userGuilds[0].id;
  }

  if (target) {
    const hasAccess = userGuilds.some(g => g.id === target);
    if (hasAccess) {
      req.guildId = target;
      req.guild = userGuilds.find(g => g.id === target);
      if (req.session) req.session.active_guild_id = target;
    }
  }

  req.userGuilds = userGuilds;
  next();
}

// Middleware estrito — bloqueia se nao tem guild ativa
function requireGuild(req, res, next) {
  if (!req.guildId) {
    return res.status(412).json({ error: 'nenhum servidor selecionado', need_guild_setup: true });
  }
  next();
}

module.exports = { resolveGuild, requireGuild };
