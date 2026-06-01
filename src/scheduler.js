const cron = require('node-cron');
const { db, getConfig, logEvent } = require('./db');
const bot = require('./bot');
const logger = require('./logger');

function start() {
  cron.schedule('* * * * *', runScheduledAnnouncements);
  cron.schedule('* * * * *', endDueGiveaways);
  cron.schedule('*/5 * * * *', expireRoles);
  cron.schedule('0 * * * *', sendExpiryWarnings);
  cron.schedule('0 * * * *', maybeSendDailyReport);
  logger.info('scheduler iniciado');
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
