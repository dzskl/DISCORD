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
  cron.schedule('*/15 * * * *', followUpAbandonedCarts);
  cron.schedule('* * * * *', rotateBotBios);
  cron.schedule('*/30 * * * *', runReconciliation);
  // Webhook DLQ drain — a cada 5 minutos
  cron.schedule('*/5 * * * *', runWebhookDlqDrain);
  // Wallet polling fallback — a cada 3min, resolve webhooks perdidos das PSPs
  cron.schedule('*/3 * * * *', runWalletPolling);
  // Reconciliacao cripto on-chain — a cada hora, valida tx hash do NOWPayments
  cron.schedule('17 * * * *', runCryptoRecon);
  // Monitor de fraude/MED — a cada 6h verifica ratio MED/total nas ultimas 24h
  cron.schedule('23 */6 * * *', runFraudMonitor);
  // Retry de outbound webhooks falhados — a cada 5min
  cron.schedule('*/5 * * * *', runOutboundRetry);
  // Cleanup diario das tabelas que crescem (webhook_events, outbound_attempts, audit)
  cron.schedule('30 3 * * *', runWalletCleanup);
  // Saque automatico — todo dia as 09:00 BRT (UTC-3 => 12:00 UTC)
  cron.schedule('0 12 * * *', runAutoWithdraw);
  // Limpeza de featured/badge expirados — diario
  cron.schedule('30 0 * * *', expireFeaturedAndBadges);
  // Gera review-invites pra vendas pagas ha 7 dias — diario as 10h
  cron.schedule('0 10 * * *', generateReviewInvites);
  logger.info('scheduler iniciado');
}

async function runReconciliation() {
  try {
    const recon = require('./reconciliation');
    await recon.run();
  } catch (e) {
    logger.error({ err: e.message }, 'reconciliacao MysticPay falhou');
  }
}

const _lock = () => require('../services/cron-lock.service');

async function runWalletPolling() {
  const r = await _lock().withLock('wallet-polling', 180, () => require('./wallet-polling').run())
    .catch(e => ({ error: e.message }));
  if (r.result?.checked > 0) logger.info(r.result, 'wallet polling executou');
  if (r.error) logger.error({ err: r.error }, 'wallet polling falhou');
}

async function runCryptoRecon() {
  const r = await _lock().withLock('crypto-recon', 600, () => require('../services/crypto-recon.service').run())
    .catch(e => ({ error: e.message }));
  if (r.result?.checked > 0) logger.info(r.result, 'crypto recon executou');
  if (r.error) logger.error({ err: r.error }, 'crypto recon falhou');
}

async function runFraudMonitor() {
  const r = await _lock().withLock('fraud-monitor', 120, () => require('../services/fraud-monitor.service').run())
    .catch(e => ({ error: e.message }));
  if (r.result?.alerts > 0) logger.warn(r.result, 'fraud monitor disparou');
  if (r.error) logger.error({ err: r.error }, 'fraud monitor falhou');
}

async function runOutboundRetry() {
  const r = await _lock().withLock('outbound-retry', 300, () => require('./outbound-webhook-retry').run())
    .catch(e => ({ error: e.message }));
  if (r.result?.retried > 0) logger.info(r.result, 'outbound retry');
  if (r.error) logger.error({ err: r.error }, 'outbound retry falhou');
}

async function runWalletCleanup() {
  const r = await _lock().withLock('wallet-cleanup', 900, () => require('./wallet-cleanup').run())
    .catch(e => ({ error: e.message }));
  const result = r.result || {};
  const total = (result.webhook_events_deleted || 0) + (result.outbound_attempts_deleted || 0) + (result.api_key_audit_deleted || 0);
  if (total > 0) logger.info(result, 'wallet cleanup');
  if (r.error) logger.error({ err: r.error }, 'wallet cleanup falhou');
}

async function runWebhookDlqDrain() {
  try {
    const dlq = require('../services/webhook-dlq.service');
    await dlq.drain(20);
  } catch (e) {
    logger.error({ err: e.message }, 'webhook DLQ drain falhou');
  }
}

async function runAutoWithdraw() {
  try {
    const aw = require('./auto-withdraw');
    await aw.run();
  } catch (e) {
    logger.error({ err: e.message }, 'auto-withdraw falhou');
  }
}

async function generateReviewInvites() {
  try {
    const reviews = require('../controllers/reviews.controller');
    const bot = require('../services/bot.service');
    const now = Math.floor(Date.now() / 1000);
    const d7 = now - 7 * 86400;
    const d8 = now - 8 * 86400;
    // Vendas pagas entre 7d e 8d atras, sem review nem invite
    const candidates = db.prepare(`
      SELECT s.id, s.discord_id, s.discord_tag, p.name AS product_name
      FROM sales s LEFT JOIN products p ON p.id = s.product_id
      WHERE s.status='paid' AND s.paid_at BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.sale_id=s.id)
        AND NOT EXISTS (SELECT 1 FROM review_invites ri WHERE ri.sale_id=s.id)
      LIMIT 200
    `).all(d8, d7);
    const publicUrl = process.env.PUBLIC_URL || '';
    for (const c of candidates) {
      try {
        const token = reviews._generateInviteForSale(db, c.id);
        const link = `${publicUrl.replace(/\/+$/, '')}/review.html?token=${token}`;
        if (bot.dmUser) {
          await bot.dmUser(c.discord_id, `📝 Que tal avaliar **${c.product_name || 'sua compra'}**?\nSua opinião ajuda outros compradores: ${link}`).catch(() => {});
        }
      } catch (e) {
        logger.warn({ err: e.message, sale_id: c.id }, 'generateReviewInvites: falha');
      }
    }
    if (candidates.length) logger.info({ count: candidates.length }, 'review invites gerados');
  } catch (e) { logger.error({ err: e.message }, 'generateReviewInvites falhou'); }
}

async function expireFeaturedAndBadges() {
  try {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE featured_products SET status='expired' WHERE status='active' AND ends_at < ?`).run(now);
    // Badge: o until ja eh autoritativo, nao precisa mexer
  } catch (e) {
    logger.error({ err: e.message }, 'expireFeaturedAndBadges falhou');
  }
}

async function rotateBotBios() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const rows = db.prepare(`
      SELECT * FROM bot_bio_rotation
      WHERE enabled = 1 AND paid = 1
        AND (last_rotated_at IS NULL OR last_rotated_at + interval_seconds <= ?)
    `).all(now);
    for (const r of rows) {
      let statuses = [];
      try { statuses = JSON.parse(r.statuses_json || '[]'); } catch {}
      if (!statuses.length) continue;
      const next = (r.current_index + 1) % statuses.length;
      const status = statuses[next];
      try {
        if (bot.setStatus) await bot.setStatus(status, r.guild_id);
      } catch (e) {
        logger.warn({ err: e.message, guild_id: r.guild_id }, 'rotateBotBios setStatus falhou');
      }
      db.prepare('UPDATE bot_bio_rotation SET current_index=?, last_rotated_at=? WHERE guild_id=?')
        .run(next, now, r.guild_id);
    }
  } catch (e) {
    logger.error({ err: e.message }, 'rotateBotBios falhou');
  }
}

// Follow-up de carrinhos abandonados.
// Sales 'pending' >30min e <24h, ainda nao notificadas, recebem DM com
// link de retomada. So roda uma vez por venda (flag cart_followup_sent).
async function followUpAbandonedCarts() {
  try {
    const { getConfig } = require('../database/connection');
    const cfg = getConfig();
    if (cfg.cart_followup_enabled === '0') return;

    const now = Math.floor(Date.now() / 1000);
    const min = now - 30 * 60;          // 30 min atras
    const max = now - 24 * 3600;        // 24h atras (limite)

    // Adiciona coluna se nao existir (idempotente)
    try { db.prepare('ALTER TABLE sales ADD COLUMN cart_followup_sent INTEGER DEFAULT 0').run(); } catch {}

    const abandoned = db.prepare(`
      SELECT * FROM sales
      WHERE status='pending'
        AND created_at BETWEEN ? AND ?
        AND (cart_followup_sent IS NULL OR cart_followup_sent = 0)
      LIMIT 50
    `).all(max, min);

    if (!abandoned.length) return;
    const publicUrl = process.env.PUBLIC_URL || '';
    const tpl = (cfg.cart_followup_message || '👋 Ei, {tag}! Você deixou um pedido no carrinho. Finalize agora e seja bem atendido: {url}');

    for (const sale of abandoned) {
      try {
        const msg = tpl
          .replace('{tag}', sale.discord_tag || 'amigo(a)')
          .replace('{url}', publicUrl + '/loja.html');
        await bot.dmUser?.(sale.discord_id, msg).catch(() => {});
        db.prepare('UPDATE sales SET cart_followup_sent=1 WHERE id=?').run(sale.id);
        logEvent({ type: 'anuncio', message: `Follow-up enviado a ${sale.discord_tag || sale.discord_id}`, discord_id: sale.discord_id, guild_id: sale.guild_id });
      } catch (e) {
        logger.warn({ err: e.message, sale_id: sale.id }, 'falha em follow-up');
      }
    }
  } catch (e) { logger.error({ err: e.message }, 'follow-up cron erro'); }
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
      let productImage = null;
      if (ann.product_id) {
        const p = db.prepare('SELECT image_url FROM products WHERE id=?').get(ann.product_id);
        if (p) productImage = p.image_url;
      }
      const sent = await bot.sendAnnouncement({
        channels: ann.channels.split(','),
        body: ann.body,
        kind: ann.kind,
        embed_title: ann.embed_title,
        embed_color: ann.embed_color,
        productName,
        productPrice,
        productImage,
        image_url: ann.image_url,
        banner_url: ann.banner_url,
        thumbnail_url: ann.thumbnail_url
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
