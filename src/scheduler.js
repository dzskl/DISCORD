const cron = require('node-cron');
const { db, logEvent } = require('./db');
const bot = require('./bot');

function start() {
  cron.schedule('* * * * *', runScheduledAnnouncements);
  cron.schedule('*/5 * * * *', expireRoles);
  console.log('[SCHED] cron iniciado');
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
    SELECT s.*, p.role_id FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.status='paid' AND s.role_granted=1 AND s.expires_at IS NOT NULL AND s.expires_at <= ?
  `).all(now);
  for (const sale of expired) {
    if (!sale.role_id) continue;
    try {
      await bot.revokeRole(sale.discord_id, sale.role_id);
      db.prepare(`UPDATE sales SET role_granted=0, status='expired' WHERE id=?`).run(sale.id);
      logEvent({ type: 'expiracao', message: `Cargo expirado para ${sale.discord_tag || sale.discord_id}`, discord_id: sale.discord_id });
    } catch (e) {
      console.error('[SCHED] erro expirando cargo:', e.message);
    }
  }
}

module.exports = { start };
