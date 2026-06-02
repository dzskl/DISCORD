// Os eventos do Discord bot ficam acoplados ao client em src/services/bot.service.js
// porque o discord.js exige listeners registrados no momento do client.on(...).
//
// Esse arquivo documenta os eventos existentes pra referencia:
//
//   client.on('ready')              -> registra slash commands + cacheia invites
//   client.on('inviteCreate')       -> atualiza cache local
//   client.on('inviteDelete')       -> remove do cache
//   client.on('guildMemberAdd')     -> log, welcome, re-grant cargos, invite tracker
//   client.on('guildMemberRemove')  -> log, detecta kick via audit log
//   client.on('guildBanAdd')        -> registra ban com moderador
//   client.on('guildMemberUpdate')  -> detecta mute/timeout
//   client.on('messageCreate')      -> auto-mod + auto-reply
//   client.on('interactionCreate')  -> slash commands + giveaway buttons
//
// Pra extrair em arquivos separados, ver TODO no roadmap.

module.exports = require('../services/bot.service');
