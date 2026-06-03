const cron = require('node-cron');
const { db, getConfig, logEvent } = require('../database/connection');
const bot = require('../services/bot.service');
const logger = require('../utils/logger');

function start() {
  cron.schedule('* * * * *', runScheduledAnnouncements);
  cron.schedule('* * * * *', endDueGiveaways);
  cron.schedule('*/5 * * * *', expireRoles);
  cron.schedule('0 * * * *', sendExpiryWarnings);
  cron.schedule('0 * * * *', maybeSendDailyReport);
  cron.schedule('15 * * * *', checkTrials);
  cron.schedule('20 * * * *', checkGuildTrials);
  logger.info('scheduler iniciado');
}

async function checkGuildTrials() {
  const now = Math.floor(Date.now() / 1000);
  const expired = db.prepare(`
    SELECT * FROM guilds
    WHERE plan='pro' AND subscription_status='trialing'
      AND trial_ends_at IS NOT NULL AND trial_ends_at < ?
  `).all(now);
  for (const g of expired) {
    db.prepare(`UPDATE guilds SET plan='free', subscription_status='expired' WHERE id=?`).run(g.id);
    logEvent({ type: 'anuncio', message: `Trial da guild ${g.name} expirou`, guild_id: g.id });
  }
}

async function checkTrials() {
  const email = require('../services/email.service');
  const now = Math.floor(Date.now() / 1000);

  // Trials expirados — volta pra free + notifica
  const expired = db.prepare(`
    SELECT * FROM users
    WHERE plan='pro' AND subscription_status='trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?
  `).all(now);
  for (const u of expired) {
    db.prepare(`UPDATE users SET plan='free', subscription_status='expired' WHERE id=?`).run(u.id);
    if (email.isConfigured()) {
      const tpl = email.T.trialExpired(u);
      await email.send({ to: u.email, ...tpl }).catch(() => {});
    }
    logEvent({ type: 'anuncio', message: `Trial de ${u.email} expirou` });
  }

  // Trials terminando em 3 dias ou 1 dia
  const ranges = [
    { days: 3, kind: 'trial_3d' },
    { days: 1, kind: 'trial_1d' },
    { days: 0, kind: 'trial_today' }
  ];
  for (const r of ranges) {
    const target = now + r.days * 86400;
    const window = 3600;
    const due = db.prepare(`
      SELECT u.* FROM users u
      WHERE u.plan='pro' AND u.subscription_status='trialing'
        AND u.trial_ends_at BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM trial_notifications WHERE user_id=u.id AND kind=?)
    `).all(target - window, target + window, r.kind);
    for (const u of due) {
      if (email.isConfigured()) {
        const tpl = email.T.trialReminder(u, r.days);
        await email.send({ to: u.email, ...tpl }).catch(() => {});
      }
      db.prepare('INSERT OR IGNORE INTO trial_notifications (user_id,kind) VALUES (?,?)').run(u.id, r.kind);
    }
  }
}

async function endDueGiveaways() {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare(`SELECT id FROM giveaways WHERE ended=0 AND ends_at <= ?`).all(now);
  for (const g of due) {
    try { await bot.endGiveaway(g.id); }
    catch (e) { logger.warn({ err: e, gid: g.id }, 'falha ao encerrar sorteio'); }
  }
}

async function runScheduledAnnouncements() {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare(`SELECT * FROM announcements WHERE status='scheduled' AND scheduled_for <= ?`).all(now);
  for (const ann of due) {
    try {
      let productName = null, productPrice = null;
      if (ann.product_id) {
        const p = db.prepare('SELECT * FROM products WHERE id=?').get(ann.product_id);
        if (p) { productName = p.name; productPrice = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ','); }
      }
      const sent = await bot.sendAnnouncement({
        channels: ann.channels.split(','),
        body: ann.body,
        kind: ann.kind,
        embed_title: ann.embed_title,
        embed_color: ann.embed_color,
        productName,
        productPrice
      });
      db.prepare(`UPDATE announcements SET status='sent', sent_at=strftime('%s','now') WHERE id=?`).run(ann.id);
      logEvent({ type: 'anuncio', message: `Anuncio agendado enviado em ${sent.join(', ')}` });
    } catch (e) {
      db.prepare(`UPDATE announcements SET status='failed' WHERE id=?`).run(ann.id);
      logEvent({ type: 'erro', message: `Falha em anuncio agendado: ${e.message}` });
    }
  }
}

async function expireRoles() {
  const now = Math.floor(Date.now() / 1000);
  const expired = db.prepare(`
    SELECT s.*, p.role_id, p.name AS pname FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.status='paid' AND s.role_granted=1 AND s.expires_at IS NOT NULL AND s.expires_at <= ?
  `).all(now);
  for (const sale of expired) {
    if (!sale.role_id) continue;
    try {
      await bot.revokeRole(sale.discord_id, sale.role_id);
      db.prepare(`UPDATE sales SET role_granted=0, status='expired' WHERE id=?`).run(sale.id);
      logEvent({ type: 'expiracao', message: `Cargo expirado para ${sale.discord_tag || sale.discord_id}`, discord_id: sale.discord_id });
      await bot.dmUser(sale.discord_id, `⏰ Seu acesso a **${sale.pname}** expirou. Renove em ${process.env.PUBLIC_URL || ''}/loja.html`);
    } catch (e) {
      logger.error({ err: e, sale: sale.id }, 'erro expirando cargo');
    }
  }
}

async function sendExpiryWarnings() {
  const now = Math.floor(Date.now() / 1000);
  const in24h = now + 86400;
  const in23h = now + 23 * 3600;
  // Sales que expiram nas proximas 24h e ainda nao foram avisadas
  const soon = db.prepare(`
    SELECT s.*, p.name AS pname FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.status='paid' AND s.role_granted=1
      AND s.expires_at BETWEEN ? AND ?
      AND (s.expiry_warned IS NULL OR s.expiry_warned=0)
  `).all(in23h, in24h);
  for (const sale of soon) {
    const sent = await bot.dmUser(sale.discord_id, `⚠️ Seu acesso a **${sale.pname}** expira em menos de 24h. Renove em ${process.env.PUBLIC_URL || ''}/loja.html para nao perder os beneficios.`);
    if (sent) db.prepare('UPDATE sales SET expiry_warned=1 WHERE id=?').run(sale.id);
  }
}

let _lastDailyReport = 0;
async function maybeSendDailyReport() {
  const cfg = getConfig();
  if (cfg.daily_report !== '1') return;
  const hour = parseInt(cfg.daily_report_hour) || 9;
  const now = new Date();
  if (now.getHours() !== hour) return;
  const dayKey = now.toISOString().slice(0, 10);
  if (_lastDailyReport === dayKey) return;
  _lastDailyReport = dayKey;
  try {
    await bot.sendDailyReport();
    logEvent({ type: 'anuncio', message: 'Relatorio diario enviado' });
  } catch (e) { logger.error({ err: e }, 'falha no relatorio diario'); }
}

module.exports = { start };
