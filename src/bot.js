const { Client, GatewayIntentBits, Partials, EmbedBuilder, AuditLogEvent, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getConfig, logEvent } = require('./db');
const logger = require('./logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Message],
  allowedMentions: { parse: ['users'], repliedUser: false }
});

const GUILD_ID = process.env.DISCORD_GUILD_ID;

const recordMember = db.prepare('INSERT INTO member_events (discord_id,discord_tag,event) VALUES (?,?,?)');
const recordMod = db.prepare('INSERT INTO mod_actions (action,target_id,target_tag,moderator_id,moderator_tag,reason) VALUES (?,?,?,?,?,?)');
const recordCmd = db.prepare('INSERT INTO command_usage (command,discord_id) VALUES (?,?)');

function publicUrl() { return process.env.PUBLIC_URL || 'http://localhost:3000'; }

// ---------- READY ----------
client.once('ready', async () => {
  logger.info({ tag: client.user.tag, guilds: client.guilds.cache.size }, 'bot online');
  await checkIntents();
  try { await registerCommands(); }
  catch (e) { logger.warn({ err: e }, 'falha ao registrar slash commands'); }
});

async function checkIntents() {
  if (!GUILD_ID) return;
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    try { await guild.members.fetch({ limit: 1 }); }
    catch { logger.error('GuildMembers intent parece desligado — habilite no Discord Developer Portal'); }
  } catch (e) {
    logger.error({ err: e, guildId: GUILD_ID }, 'falha ao acessar a guild — verifique DISCORD_GUILD_ID e se o bot foi convidado');
  }
}

async function registerCommands() {
  if (!process.env.DISCORD_CLIENT_ID || !GUILD_ID) return;
  const commands = [
    new SlashCommandBuilder().setName('produtos').setDescription('Lista os produtos a venda'),
    new SlashCommandBuilder().setName('comprar').setDescription('Mostra o link da loja'),
    new SlashCommandBuilder().setName('cupom').setDescription('Valida um cupom de desconto')
      .addStringOption(o => o.setName('codigo').setDescription('Codigo do cupom').setRequired(true)),
    new SlashCommandBuilder().setName('meusprodutos').setDescription('Mostra suas compras'),
    new SlashCommandBuilder().setName('meusavisos').setDescription('Mostra seus avisos no servidor'),
    new SlashCommandBuilder().setName('help').setDescription('Lista os comandos disponiveis'),
    new SlashCommandBuilder().setName('regras').setDescription('Mostra as regras do servidor'),
    new SlashCommandBuilder().setName('warn').setDescription('Avisa um usuario').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo do aviso').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('Remove um usuario do servidor').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),
    new SlashCommandBuilder().setName('ban').setDescription('Bane um usuario').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, GUILD_ID), { body: commands });
  logger.info({ count: commands.length }, 'slash commands registrados');
}

// ---------- LOG/MOD CHANNEL FORWARDING + WEBHOOK ----------
async function forwardToChannel(channelName, content) {
  if (!channelName) return;
  const clean = channelName.replace(/^#/, '');
  if (!clean) return;
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const ch = guild.channels.cache.find(c => c.name === clean && c.isTextBased && c.isTextBased());
    if (ch) await ch.send(content);
  } catch (e) { logger.warn({ err: e, channel: channelName }, 'falha ao enviar para canal'); }
}

async function forwardWebhook(payload) {
  const cfg = getConfig();
  if (!cfg.webhook_url || !cfg.webhook_url.startsWith('http')) return;
  try {
    await fetch(cfg.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) { logger.warn({ err: e }, 'webhook forward falhou'); }
}

function broadcast(type, message, opts = {}) {
  const cfg = getConfig();
  if (cfg.log_events !== '1') return;
  if (opts.modAction) forwardToChannel(cfg.mod_channel, opts.embed ? { embeds: [opts.embed] } : `**[${type}]** ${message}`);
  else if (opts.toLogs !== false) forwardToChannel(cfg.logs_channel, opts.embed ? { embeds: [opts.embed] } : `\`[${type}]\` ${message}`);
  forwardWebhook({ type, message, ...opts.payload });
}

// ---------- MEMBER EVENTS ----------
client.on('guildMemberAdd', async (m) => {
  if (m.guild.id !== GUILD_ID) return;
  recordMember.run(m.id, m.user.tag, 'join');
  logEvent({ type: 'entrada', message: `${m.user.tag} entrou no servidor`, discord_id: m.id, discord_tag: m.user.tag });

  const cfg = getConfig();
  broadcast('entrada', `${m.user.tag} entrou`, { payload: { discord_id: m.id } });

  // Welcome message
  const welcomeName = (cfg.welcome_channel || '').replace(/^#/, '');
  if (welcomeName) {
    const ch = m.guild.channels.cache.find(c => c.name === welcomeName && c.isTextBased && c.isTextBased());
    if (ch) {
      const template = cfg.welcome_message || 'Bem-vindo(a), {user}! 👋';
      const msg = template
        .replace(/\{user\}/g, `<@${m.id}>`)
        .replace(/\{tag\}/g, m.user.tag)
        .replace(/\{server\}/g, m.guild.name)
        .replace(/\{count\}/g, m.guild.memberCount);
      ch.send(msg).catch(() => {});
    }
  }

  // Re-grant active paid roles (caso o cara tenha comprado, saiu e voltou)
  try {
    const activeSales = db.prepare(`
      SELECT s.*, p.role_id FROM sales s
      JOIN products p ON p.id = s.product_id
      WHERE s.discord_id = ? AND s.status = 'paid' AND s.role_granted = 1
        AND (s.expires_at IS NULL OR s.expires_at > strftime('%s','now'))
        AND p.role_id IS NOT NULL
    `).all(m.id);
    for (const sale of activeSales) {
      await m.roles.add(sale.role_id).catch(() => {});
    }
    if (activeSales.length) {
      logger.info({ user: m.id, count: activeSales.length }, 'cargos re-aplicados ao retornar');
      logEvent({ type: 'venda', message: `${activeSales.length} cargo(s) re-aplicado(s) ao retornar`, discord_id: m.id, discord_tag: m.user.tag });
    }
  } catch (e) { logger.warn({ err: e, user: m.id }, 'falha ao re-aplicar cargos'); }
});

client.on('guildMemberRemove', async (m) => {
  if (m.guild.id !== GUILD_ID) return;

  // Distinguir kick de leave via audit log
  let wasKick = false, mod = null, reason = '';
  try {
    const entry = await m.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 }).then(l => l.entries.first());
    if (entry && entry.target?.id === m.id && Date.now() - entry.createdTimestamp < 10000) {
      wasKick = true; mod = entry.executor; reason = entry.reason || '';
    }
  } catch {}

  const tag = m.user?.tag || m.id;
  if (wasKick) {
    recordMod.run('kick', m.id, tag, mod?.id || null, mod?.tag || null, reason);
    logEvent({ type: 'kick', message: `${tag} kickado${reason ? ' — ' + reason : ''}`, discord_id: m.id, discord_tag: tag });
    broadcast('kick', `${tag} kickado por ${mod?.tag || '?'}${reason ? ' — ' + reason : ''}`, { modAction: true, payload: { discord_id: m.id, moderator_id: mod?.id, reason } });
  } else {
    recordMember.run(m.id, tag, 'leave');
    logEvent({ type: 'saida', message: `${tag} saiu do servidor`, discord_id: m.id, discord_tag: tag });
    broadcast('saida', `${tag} saiu`, { payload: { discord_id: m.id } });
  }
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
  broadcast('ban', `${ban.user.tag} banido por ${mod?.tag || '?'}${reason ? ' — ' + reason : ''}`, { modAction: true, payload: { discord_id: ban.user.id, moderator_id: mod?.id, reason } });
});

client.on('guildMemberUpdate', async (oldM, newM) => {
  if (newM.guild.id !== GUILD_ID) return;
  const wasTimedOut = oldM.communicationDisabledUntilTimestamp && oldM.communicationDisabledUntilTimestamp > Date.now();
  const isTimedOut = newM.communicationDisabledUntilTimestamp && newM.communicationDisabledUntilTimestamp > Date.now();
  if (!wasTimedOut && isTimedOut) {
    let mod = null, reason = '';
    try {
      const entry = await newM.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 5 }).then(l => l.entries.find(e => e.target?.id === newM.id && Date.now() - e.createdTimestamp < 10000));
      if (entry) { mod = entry.executor; reason = entry.reason || ''; }
    } catch {}
    recordMod.run('mute', newM.id, newM.user.tag, mod?.id || null, mod?.tag || null, reason || 'timeout');
    logEvent({ type: 'mute', message: `${newM.user.tag} mutado${reason ? ' — ' + reason : ''}`, discord_id: newM.id, discord_tag: newM.user.tag });
    broadcast('mute', `${newM.user.tag} mutado por ${mod?.tag || '?'}${reason ? ' — ' + reason : ''}`, { modAction: true, payload: { discord_id: newM.id, moderator_id: mod?.id, reason } });
  }
});

// ---------- AUTO-MOD + AUTO-REPLY (messageCreate) ----------
const userMessageHistory = new Map(); // userId -> [{content, t}]
const autoReplyCooldown = new Map(); // userId -> lastReplyTimestamp
const AUTO_REPLY_COOLDOWN_MS = 5000;

setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of userMessageHistory) {
    const filtered = v.filter(m => m.t > cutoff);
    if (filtered.length) userMessageHistory.set(k, filtered);
    else userMessageHistory.delete(k);
  }
  for (const [k, t] of autoReplyCooldown) {
    if (Date.now() - t > AUTO_REPLY_COOLDOWN_MS * 4) autoReplyCooldown.delete(k);
  }
}, 30000);

async function applyAutoMod(msg, cfg) {
  if (cfg.auto_mod !== '1') return false;
  const member = msg.member;
  if (!member || member.permissions?.has(PermissionFlagsBits.ManageMessages)) return false;

  const text = msg.content || '';
  const textLower = text.toLowerCase();
  let violation = null;

  // Filtro de palavras
  if (cfg.filter_words === '1') {
    const words = (cfg.forbidden_words || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    if (words.some(w => textLower.includes(w))) violation = { reason: 'palavra proibida', action: 'delete-warn' };
  }

  // Filtro de links
  if (!violation && cfg.filter_links === '1') {
    const linkMatch = text.match(/https?:\/\/([^\s\/]+)/i);
    if (linkMatch) {
      const allow = (cfg.link_allowlist || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
      const host = linkMatch[1].toLowerCase();
      if (!allow.some(d => host === d || host.endsWith('.' + d))) violation = { reason: 'link nao permitido', action: 'delete-warn' };
    }
  }

  // Anti-spam (5+ mensagens identicas em 10s)
  if (!violation && cfg.anti_spam === '1') {
    const hist = userMessageHistory.get(msg.author.id) || [];
    const recent = hist.filter(m => Date.now() - m.t < 10000);
    const sameCount = recent.filter(m => m.content === text).length;
    if (sameCount >= 4) violation = { reason: 'spam', action: 'timeout', minutes: 5 };
  }

  // Anti-flood (10+ mensagens em 5s)
  if (!violation && cfg.anti_flood === '1') {
    const hist = userMessageHistory.get(msg.author.id) || [];
    const recent = hist.filter(m => Date.now() - m.t < 5000);
    if (recent.length >= 9) violation = { reason: 'flood', action: 'timeout', minutes: 1 };
  }

  if (!violation) return false;

  try {
    await msg.delete().catch(() => {});
    if (violation.action === 'timeout' && member.moderatable) {
      await member.timeout(violation.minutes * 60 * 1000, 'auto-mod: ' + violation.reason).catch(() => {});
    }
    recordMod.run('automod', msg.author.id, msg.author.tag, null, 'bot', violation.reason);
    logEvent({ type: 'warn', message: `auto-mod: ${msg.author.tag} — ${violation.reason}`, discord_id: msg.author.id, discord_tag: msg.author.tag, channel: msg.channel?.name });
    broadcast('automod', `${msg.author.tag} acionou auto-mod — ${violation.reason}`, { modAction: true, payload: { discord_id: msg.author.id, reason: violation.reason } });
  } catch (e) { logger.warn({ err: e }, 'auto-mod falhou'); }
  return true;
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || msg.guild?.id !== GUILD_ID) return;
  const cfg = getConfig();

  // Track for spam/flood detection
  const hist = userMessageHistory.get(msg.author.id) || [];
  hist.push({ content: msg.content, t: Date.now() });
  userMessageHistory.set(msg.author.id, hist.slice(-20));

  // Auto-mod
  if (await applyAutoMod(msg, cfg)) return;

  // Auto-reply (com cooldown por usuario)
  const text = (msg.content || '').toLowerCase();
  if (!text) return;
  const lastReply = autoReplyCooldown.get(msg.author.id) || 0;
  if (Date.now() - lastReply < AUTO_REPLY_COOLDOWN_MS) return;

  const replies = db.prepare('SELECT * FROM auto_replies WHERE active=1').all();
  for (const r of replies) {
    const trig = r.trigger.toLowerCase();
    let hit = false;
    if (r.match_type === 'equals') hit = text === trig;
    else if (r.match_type === 'starts_with') hit = text.startsWith(trig);
    else hit = text.includes(trig);
    if (hit) {
      await msg.reply({ content: r.response, allowedMentions: { repliedUser: false } }).catch(() => {});
      db.prepare('UPDATE auto_replies SET uses=uses+1 WHERE id=?').run(r.id);
      autoReplyCooldown.set(msg.author.id, Date.now());
      break;
    }
  }
});

// ---------- SLASH COMMANDS ----------
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const cfg = getConfig();
  if (cfg.maintenance === '1') {
    return i.reply({ content: '🔧 O bot esta em modo manutencao. Tente novamente em alguns minutos.', ephemeral: true });
  }

  recordCmd.run(i.commandName, i.user.id);
  logEvent({ type: 'cmd', message: `/${i.commandName} executado`, discord_id: i.user.id, discord_tag: i.user.tag, channel: i.channel?.name || null });

  try {
    switch (i.commandName) {
      case 'help': {
        const eb = new EmbedBuilder().setTitle('Comandos disponiveis').setColor(0x5865f2)
          .setDescription([
            '`/produtos` — lista produtos a venda',
            '`/comprar` — link da loja',
            '`/cupom <codigo>` — valida um cupom',
            '`/meusprodutos` — suas compras',
            '`/meusavisos` — seus avisos no servidor',
            '`/regras` — regras do servidor',
            '',
            '**Moderacao:** `/warn` `/kick` `/ban` (apenas mods)'
          ].join('\n'));
        await i.reply({ embeds: [eb], ephemeral: true });
        break;
      }
      case 'regras':
        await i.reply({ content: '**Regras do servidor:**\n\n' + (cfg.rules_text || 'Nenhuma regra cadastrada.'), ephemeral: true });
        break;
      case 'produtos': {
        const list = db.prepare('SELECT * FROM products WHERE active=1 ORDER BY price_cents').all();
        if (!list.length) return i.reply({ content: 'Nenhum produto disponivel.', ephemeral: true });
        const eb = new EmbedBuilder().setTitle('Produtos disponiveis').setColor(0x5865f2)
          .setDescription(list.map(p => `**${p.name}** — R$ ${(p.price_cents / 100).toFixed(2).replace('.', ',')}\n${p.description || ''}`).join('\n\n'))
          .setFooter({ text: `Compre em ${publicUrl()}/loja.html` });
        await i.reply({ embeds: [eb], ephemeral: true });
        break;
      }
      case 'comprar':
        await i.reply({ content: `🛒 Acesse a loja: ${publicUrl()}/loja.html\nSeu ID do Discord: \`${i.user.id}\``, ephemeral: true });
        break;
      case 'cupom': {
        const code = i.options.getString('codigo').toUpperCase();
        const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(code);
        if (!c) return i.reply({ content: '❌ Cupom invalido.', ephemeral: true });
        if (c.expires_at && c.expires_at < Math.floor(Date.now() / 1000)) return i.reply({ content: '❌ Cupom expirado.', ephemeral: true });
        if (c.max_uses != null && c.uses >= c.max_uses) return i.reply({ content: '❌ Cupom esgotado.', ephemeral: true });
        await i.reply({ content: `✅ Cupom **${c.code}** valido — desconto de **${c.discount_percent}%**.`, ephemeral: true });
        break;
      }
      case 'meusprodutos': {
        const buys = db.prepare(`
          SELECT s.*, p.name AS pname FROM sales s LEFT JOIN products p ON p.id=s.product_id
          WHERE s.discord_id=? AND s.status='paid' ORDER BY s.paid_at DESC LIMIT 20
        `).all(i.user.id);
        if (!buys.length) return i.reply({ content: 'Voce ainda nao comprou nada.', ephemeral: true });
        const lines = buys.map(b => `• ${b.pname || '—'} — R$ ${(b.amount_cents / 100).toFixed(2).replace('.', ',')} (${new Date(b.paid_at * 1000).toLocaleDateString('pt-BR')}${b.expires_at ? ` · expira ${new Date(b.expires_at * 1000).toLocaleDateString('pt-BR')}` : ''})`);
        await i.reply({ content: '**Suas compras:**\n' + lines.join('\n'), ephemeral: true });
        break;
      }
      case 'meusavisos': {
        const warns = db.prepare(`SELECT * FROM mod_actions WHERE target_id=? AND action IN ('warn','automod') ORDER BY created_at DESC LIMIT 20`).all(i.user.id);
        if (!warns.length) return i.reply({ content: '✨ Voce nao tem avisos.', ephemeral: true });
        const lines = warns.map(w => `• [${new Date(w.created_at * 1000).toLocaleDateString('pt-BR')}] ${w.reason || 'sem motivo'} — por ${w.moderator_tag || 'bot'}`);
        await i.reply({ content: `**Seus avisos (${warns.length}):**\n` + lines.join('\n'), ephemeral: true });
        break;
      }
      case 'warn': {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) return i.reply({ content: '❌ Sem permissao.', ephemeral: true });
        const user = i.options.getUser('usuario');
        const motivo = i.options.getString('motivo');
        recordMod.run('warn', user.id, user.tag, i.user.id, i.user.tag, motivo);
        logEvent({ type: 'warn', message: `${user.tag} avisado — ${motivo}`, discord_id: user.id, discord_tag: user.tag });
        broadcast('warn', `${user.tag} avisado por ${i.user.tag} — ${motivo}`, { modAction: true, payload: { discord_id: user.id, moderator_id: i.user.id, reason: motivo } });
        await user.send(`⚠️ Voce recebeu um aviso em **${i.guild.name}**: ${motivo}`).catch(() => {});
        await i.reply({ content: `✅ <@${user.id}> avisado.`, ephemeral: true });
        break;
      }
      case 'kick': {
        if (!i.memberPermissions?.has(PermissionFlagsBits.KickMembers)) return i.reply({ content: '❌ Sem permissao.', ephemeral: true });
        const user = i.options.getUser('usuario');
        const motivo = i.options.getString('motivo') || 'sem motivo';
        const member = await i.guild.members.fetch(user.id).catch(() => null);
        if (!member) return i.reply({ content: '❌ Usuario nao encontrado no servidor.', ephemeral: true });
        await member.kick(motivo);
        await i.reply({ content: `✅ ${user.tag} removido.`, ephemeral: true });
        break;
      }
      case 'ban': {
        if (!i.memberPermissions?.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: '❌ Sem permissao.', ephemeral: true });
        const user = i.options.getUser('usuario');
        const motivo = i.options.getString('motivo') || 'sem motivo';
        await i.guild.members.ban(user.id, { reason: motivo });
        await i.reply({ content: `✅ ${user.tag} banido.`, ephemeral: true });
        break;
      }
    }
  } catch (e) {
    logger.error({ err: e, cmd: i.commandName }, 'erro em slash command');
    if (!i.replied) await i.reply({ content: 'Erro ao processar comando.', ephemeral: true }).catch(() => {});
  }
});

// ---------- HELPERS USADOS PELO BACKEND ----------
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

  const allowedMentions = { parse: ['users'] };

  for (const ch of targets) {
    if (kind === 'embed' || kind === 'produto') {
      const colorMap = { '#fff': 0xffffff, '#5865f2': 0x5865f2, '#5fff5f': 0x5fff5f, '#ff5f5f': 0xff5f5f, '#ffdf5f': 0xffdf5f };
      const eb = new EmbedBuilder()
        .setTitle(kind === 'produto' ? productName || embed_title || 'Produto' : embed_title || ' ')
        .setDescription(body)
        .setColor(colorMap[embed_color] ?? 0x5865f2);
      if (kind === 'produto' && productPrice) eb.addFields({ name: 'Preco', value: productPrice });
      await ch.send({ embeds: [eb], allowedMentions });
    } else {
      await ch.send({ content: body, allowedMentions });
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
  await forwardToChannel(cfg.sales_channel, text);
}

async function dmUser(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
    return true;
  } catch (e) { return false; }
}

async function getDailyStats() {
  const dayStart = Math.floor(Date.now() / 1000) - 86400;
  const joins = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='join' AND created_at >= ?`).get(dayStart).c;
  const leaves = db.prepare(`SELECT COUNT(*) AS c FROM member_events WHERE event='leave' AND created_at >= ?`).get(dayStart).c;
  const sales = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(dayStart);
  const mod = db.prepare(`SELECT action, COUNT(*) AS c FROM mod_actions WHERE created_at >= ? GROUP BY action`).all(dayStart);
  const cmds = db.prepare(`SELECT COUNT(*) AS c FROM command_usage WHERE created_at >= ?`).get(dayStart).c;
  return { joins, leaves, sales: sales.c, revenue_cents: sales.v, mod, cmds };
}

async function sendDailyReport() {
  const cfg = getConfig();
  if (cfg.daily_report !== '1') return;
  const s = await getDailyStats();
  const eb = new EmbedBuilder()
    .setTitle('📊 Relatorio diario')
    .setColor(0x5865f2)
    .setDescription(`Resumo das ultimas 24h`)
    .addFields(
      { name: '👥 Membros', value: `+${s.joins} entradas\n-${s.leaves} saidas`, inline: true },
      { name: '💰 Vendas', value: `${s.sales} venda(s)\nR$ ${(s.revenue_cents / 100).toFixed(2).replace('.', ',')}`, inline: true },
      { name: '🛡️ Moderacao', value: s.mod.length ? s.mod.map(m => `${m.action}: ${m.c}`).join('\n') : 'nenhuma acao', inline: true },
      { name: '⚡ Comandos', value: `${s.cmds} execucao(oes)`, inline: false }
    )
    .setTimestamp();
  await forwardToChannel(cfg.logs_channel, { embeds: [eb] });
  await forwardWebhook({ type: 'daily_report', stats: s });
}

function start() {
  if (!process.env.DISCORD_TOKEN) {
    logger.warn('DISCORD_TOKEN nao definido — bot nao iniciado');
    return Promise.resolve();
  }
  return client.login(process.env.DISCORD_TOKEN);
}

module.exports = {
  client, start, fetchGuild, getStats, listChannels, listRoles, listMembers,
  sendAnnouncement, banMember, kickMember, timeoutMember, grantRole, revokeRole,
  notifySaleChannel, dmUser, sendDailyReport, broadcast
};
