const { Client, GatewayIntentBits, Partials, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { db, getConfig, logEvent } = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Message]
});

const GUILD_ID = process.env.DISCORD_GUILD_ID;

const recordMember = db.prepare('INSERT INTO member_events (discord_id,discord_tag,event) VALUES (?,?,?)');
const recordMod = db.prepare('INSERT INTO mod_actions (action,target_id,target_tag,moderator_id,moderator_tag,reason) VALUES (?,?,?,?,?,?)');
const recordCmd = db.prepare('INSERT INTO command_usage (command,discord_id) VALUES (?,?)');

client.once('ready', () => {
  console.log(`[BOT] online como ${client.user.tag}`);
});

client.on('guildMemberAdd', (m) => {
  if (m.guild.id !== GUILD_ID) return;
  recordMember.run(m.id, m.user.tag, 'join');
  logEvent({ type: 'entrada', message: `${m.user.tag} entrou no servidor`, discord_id: m.id, discord_tag: m.user.tag });

  const cfg = getConfig();
  const welcomeName = (cfg.welcome_channel || '').replace(/^#/, '');
  if (welcomeName) {
    const ch = m.guild.channels.cache.find(c => c.name === welcomeName && c.isTextBased && c.isTextBased());
    if (ch) ch.send(`Bem-vindo(a), <@${m.id}>! 👋`).catch(() => {});
  }
});

client.on('guildMemberRemove', (m) => {
  if (m.guild.id !== GUILD_ID) return;
  recordMember.run(m.id, m.user?.tag || null, 'leave');
  logEvent({ type: 'saida', message: `${m.user?.tag || m.id} saiu do servidor`, discord_id: m.id, discord_tag: m.user?.tag || null });
});

client.on('guildBanAdd', async (ban) => {
  if (ban.guild.id !== GUILD_ID) return;
  let mod = null, reason = '';
  try {
    const entry = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).then(l => l.entries.first());
    if (entry && entry.target.id === ban.user.id) { mod = entry.executor; reason = entry.reason || ''; }
  } catch {}
  recordMod.run('ban', ban.user.id, ban.user.tag, mod?.id || null, mod?.tag || null, reason);
  logEvent({ type: 'ban', message: `${ban.user.tag} banido${reason ? ' — ' + reason : ''}`, discord_id: ban.user.id, discord_tag: ban.user.tag });
});

client.on('guildMemberUpdate', async (oldM, newM) => {
  if (newM.guild.id !== GUILD_ID) return;
  const wasTimedOut = oldM.communicationDisabledUntilTimestamp && oldM.communicationDisabledUntilTimestamp > Date.now();
  const isTimedOut = newM.communicationDisabledUntilTimestamp && newM.communicationDisabledUntilTimestamp > Date.now();
  if (!wasTimedOut && isTimedOut) {
    recordMod.run('mute', newM.id, newM.user.tag, null, null, 'timeout');
    logEvent({ type: 'mute', message: `${newM.user.tag} mutado`, discord_id: newM.id, discord_tag: newM.user.tag });
  }
});

client.on('interactionCreate', (i) => {
  if (!i.isChatInputCommand()) return;
  recordCmd.run(i.commandName, i.user.id);
  logEvent({ type: 'cmd', message: `/${i.commandName} executado`, discord_id: i.user.id, discord_tag: i.user.tag, channel: i.channel?.name || null });
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || msg.guild?.id !== GUILD_ID) return;
  const text = msg.content.toLowerCase();
  if (!text) return;
  const replies = db.prepare('SELECT * FROM auto_replies WHERE active=1').all();
  for (const r of replies) {
    const trig = r.trigger.toLowerCase();
    let hit = false;
    if (r.match_type === 'equals') hit = text === trig;
    else if (r.match_type === 'starts_with') hit = text.startsWith(trig);
    else hit = text.includes(trig);
    if (hit) {
      await msg.reply(r.response).catch(() => {});
      db.prepare('UPDATE auto_replies SET uses=uses+1 WHERE id=?').run(r.id);
      break;
    }
  }
});

async function fetchGuild() {
  if (!GUILD_ID) throw new Error('DISCORD_GUILD_ID nao definido');
  return client.guilds.fetch(GUILD_ID);
}

async function getStats() {
  const guild = await fetchGuild();
  await guild.members.fetch().catch(() => {});
  const members = guild.members.cache;
  const online = members.filter(m => ['online', 'idle', 'dnd'].includes(m.presence?.status)).size;
  return { total: guild.memberCount, online };
}

async function listChannels() {
  const guild = await fetchGuild();
  const channels = await guild.channels.fetch();
  return channels.filter(c => c && c.isTextBased && c.isTextBased()).map(c => ({ id: c.id, name: c.name }));
}

async function listRoles() {
  const guild = await fetchGuild();
  const roles = await guild.roles.fetch();
  return roles.filter(r => !r.managed && r.name !== '@everyone').map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
}

async function listMembers(limit = 100) {
  const guild = await fetchGuild();
  const members = await guild.members.fetch();
  return [...members.values()].slice(0, limit).map(m => ({
    id: m.id,
    tag: m.user.tag,
    nickname: m.nickname,
    avatar: m.user.displayAvatarURL({ size: 64 }),
    joinedAt: m.joinedTimestamp,
    status: m.presence?.status || 'offline',
    roles: m.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name)
  }));
}

async function sendAnnouncement({ channels, body, kind, embed_title, embed_color, productName, productPrice }) {
  const guild = await fetchGuild();
  const allChannels = await guild.channels.fetch();
  const targets = channels.map(name => {
    const clean = name.replace(/^#/, '');
    return allChannels.find(c => c && c.name === clean && c.isTextBased && c.isTextBased());
  }).filter(Boolean);

  if (!targets.length) throw new Error('Nenhum canal valido');

  for (const ch of targets) {
    if (kind === 'embed' || kind === 'produto') {
      const colorMap = { '#fff': 0xffffff, '#5865f2': 0x5865f2, '#5fff5f': 0x5fff5f, '#ff5f5f': 0xff5f5f, '#ffdf5f': 0xffdf5f };
      const eb = new EmbedBuilder()
        .setTitle(kind === 'produto' ? productName || embed_title || 'Produto' : embed_title || ' ')
        .setDescription(body)
        .setColor(colorMap[embed_color] ?? 0xffffff);
      if (kind === 'produto' && productPrice) eb.addFields({ name: 'Preco', value: productPrice });
      await ch.send({ embeds: [eb] });
    } else {
      await ch.send(body);
    }
  }
  return targets.map(c => '#' + c.name);
}

async function banMember(userId, reason) {
  const guild = await fetchGuild();
  await guild.members.ban(userId, { reason });
}

async function kickMember(userId, reason) {
  const guild = await fetchGuild();
  const member = await guild.members.fetch(userId);
  await member.kick(reason);
  recordMod.run('kick', userId, member.user.tag, null, null, reason || '');
  logEvent({ type: 'kick', message: `${member.user.tag} kickado${reason ? ' — ' + reason : ''}`, discord_id: userId, discord_tag: member.user.tag });
}

async function timeoutMember(userId, minutes, reason) {
  const guild = await fetchGuild();
  const member = await guild.members.fetch(userId);
  await member.timeout(minutes * 60 * 1000, reason);
}

async function grantRole(userId, roleId) {
  const guild = await fetchGuild();
  const member = await guild.members.fetch(userId);
  await member.roles.add(roleId);
  return member.user.tag;
}

async function revokeRole(userId, roleId) {
  const guild = await fetchGuild();
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.remove(roleId).catch(() => {});
}

async function notifySaleChannel(text) {
  const cfg = getConfig();
  if (cfg.alert_sales !== '1') return;
  const name = (cfg.sales_channel || '').replace(/^#/, '');
  if (!name) return;
  const guild = await fetchGuild();
  const ch = guild.channels.cache.find(c => c.name === name && c.isTextBased && c.isTextBased());
  if (ch) await ch.send(text).catch(() => {});
}

function start() {
  if (!process.env.DISCORD_TOKEN) {
    console.warn('[BOT] DISCORD_TOKEN nao definido — bot nao iniciado.');
    return Promise.resolve();
  }
  return client.login(process.env.DISCORD_TOKEN);
}

module.exports = {
  client, start, fetchGuild, getStats, listChannels, listRoles, listMembers,
  sendAnnouncement, banMember, kickMember, timeoutMember, grantRole, revokeRole, notifySaleChannel
};
