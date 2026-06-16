// Fulfillment: marca a sale como paga e roda todos os efeitos colaterais
// (hold, ledger, points, referral, conquistas, entrega via bot, notif).
//
// Idempotente: chamar duas vezes na mesma sale eh no-op apos a primeira.
// Usado pelos webhooks Stripe (legado), MercadoPago, PushinPay, NOWPayments etc.

const { db, getConfig } = require('../database/connection');
const logger = require('../utils/logger');

function parseCart(json) {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function computeExpiry(duration) {
  if (!duration || duration === 'permanent') return null;
  const now = Math.floor(Date.now() / 1000);
  const map = { '1d': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '1y': 365 * 86400 };
  return now + (map[duration] || 0);
}

async function fulfillSale(saleId, opts = {}) {
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
  if (!sale) return { ok: false, error: 'sale_not_found' };
  if (sale.status === 'paid') return { ok: true, already_paid: true, sale };

  const meta = opts.metadata || {};
  const cartItems = parseCart(sale.cart_items);
  const firstProduct = sale.product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(sale.product_id) : null;
  const expiresAt = computeExpiry(firstProduct?.duration);

  // 1. Marca como paga
  db.prepare(`
    UPDATE sales SET status='paid', paid_at=strftime('%s','now'), expires_at=?
    WHERE id=?
  `).run(expiresAt, sale.id);

  // 2. Platform fee (pricing v3: zero — mas mantemos a chamada pra preencher net_to_owner_cents)
  let feeRes = null;
  try { feeRes = require('../config/platform-fee').applyFeeToSale(db, sale.id); } catch (e) { logger.warn({ err: e.message, sale: sale.id }, 'platform-fee falhou'); }

  // 3. Hold escalonado
  try { require('../config/hold-period').applyHoldToSale(db, sale.id); } catch (e) { logger.warn({ err: e.message, sale: sale.id }, 'hold falhou'); }

  // 4. BotDash Points + Referral
  try {
    if (feeRes?.seller_id && feeRes?.net_to_owner_cents) {
      require('./points.service').awardForSale(db, feeRes.seller_id, sale.id, feeRes.net_to_owner_cents);
      const platformRev = (feeRes.percent_fee_cents || 0) + (feeRes.fixed_fee_cents || 0);
      require('./referrals.service').payCommissionFromSale(db, feeRes.seller_id, sale.id, platformRev);
    }
  } catch (e) { logger.warn({ err: e.message, sale: sale.id }, 'points/referral falhou'); }

  // 5. Conquistas
  try {
    const updated = db.prepare('SELECT * FROM sales WHERE id=?').get(sale.id);
    require('./achievements.service').checkAfterSale(updated);
  } catch (e) { logger.warn({ err: e.message }, 'achievements falhou'); }

  // 6. Notifica vendedor
  try {
    const target = sale.guild_id
      ? db.prepare(`SELECT ug.user_id AS id FROM user_guilds ug WHERE ug.guild_id=? AND ug.role IN ('owner','admin')`).all(sale.guild_id)
      : db.prepare(`SELECT id FROM users WHERE role='owner' AND active=1`).all();
    const title = `Nova venda: ${firstProduct?.name || 'produto'}`;
    const body = `R$ ${(sale.amount_cents / 100).toFixed(2).replace('.', ',')} · ${sale.discord_tag || sale.discord_id} · ${sale.provider || 'gateway'}`;
    for (const u of target) {
      db.prepare(`INSERT INTO notifications (user_id, guild_id, kind, title, body, link) VALUES (?, ?, 'sale', ?, ?, '/app.html#vendas')`)
        .run(u.id, sale.guild_id || null, title, body);
    }
  } catch (e) { /* notifications table opcional */ }

  // 7. Cupom: incrementa uso
  if (meta.coupon_id) {
    try { db.prepare('UPDATE coupons SET uses=uses+1 WHERE id=?').run(parseInt(meta.coupon_id)); } catch {}
  }

  // 8. Afiliado: comissao
  if (meta.affiliate_id || sale.affiliate_id) {
    try {
      const aid = parseInt(meta.affiliate_id || sale.affiliate_id);
      const aff = db.prepare('SELECT * FROM affiliates WHERE id=?').get(aid);
      if (aff) {
        const commission = Math.round(sale.amount_cents * aff.commission_percent / 100);
        db.prepare('UPDATE sales SET affiliate_id=?, commission_cents=? WHERE id=?').run(aid, commission, sale.id);
        db.prepare('UPDATE affiliates SET total_sales=total_sales+1, total_commission_cents=total_commission_cents+? WHERE id=?').run(commission, aid);
        try {
          const bot = require('./bot.service');
          await bot.dmUser(aff.discord_id, `💰 Voce ganhou R$ ${(commission / 100).toFixed(2).replace('.', ',')} de comissao pela venda do seu link de afiliado!`).catch(() => {});
        } catch {}
      }
    } catch (e) { logger.warn({ err: e.message }, 'affiliate commission falhou'); }
  }

  // 9. Entrega: decrementa estoque + cargo / abre ticket
  const cfg = getConfig();
  let hasManualDelivery = false;
  const tagsBought = [];
  for (const item of cartItems) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
    if (!p) continue;
    if (p.stock != null) {
      const newQty = Math.max(0, p.stock - item.q);
      db.prepare('UPDATE products SET stock=? WHERE id=?').run(newQty, p.id);
      try {
        db.prepare('INSERT INTO stock_log (product_id,delta,before_qty,after_qty,reason,actor) VALUES (?,?,?,?,?,?)')
          .run(p.id, -item.q, p.stock, newQty, `venda #${sale.id}`, sale.discord_tag || sale.discord_id);
      } catch {}
    }
    if (p.delivery_type === 'manual') hasManualDelivery = true;
    if (p.role_id) {
      try {
        const bot = require('./bot.service');
        const ok = await bot.grantRole(meta.discord_id || sale.discord_id, p.role_id);
        if (ok) tagsBought.push(p.name);
      } catch (e) { logger.warn({ err: e.message, sale: sale.id }, 'grantRole falhou'); }
    }
  }

  // 10. DM cliente (apos entrega)
  try {
    const bot = require('./bot.service');
    const valueStr = `R$ ${(sale.amount_cents / 100).toFixed(2).replace('.', ',')}`;
    const productsStr = tagsBought.length ? tagsBought.join(', ') : (firstProduct?.name || 'produto');
    const dmBody = `✅ Pagamento confirmado! Voce comprou: ${productsStr} · ${valueStr}`;
    bot.dmUser(meta.discord_id || sale.discord_id, dmBody).catch(() => {});
  } catch {}

  // 11. Ticket de entrega manual
  if (hasManualDelivery) {
    try {
      db.prepare(`UPDATE sales SET delivery_status='pending_manual' WHERE id=?`).run(sale.id);
    } catch {}
  }

  // 12. Outbound webhook pros vendedores que assinaram sale.paid
  try {
    const ob = require('./outbound-webhooks.service');
    const finalSale = db.prepare('SELECT * FROM sales WHERE id=?').get(sale.id);
    const sellerId = feeRes?.seller_id || findOwnerForGuild(sale.guild_id);
    ob.dispatch('sale.paid', {
      user_id: sellerId,
      guild_id: sale.guild_id,
      sale_id: sale.id,
      amount_cents: finalSale.amount_cents,
      net_cents: finalSale.net_to_owner_cents,
      discord_id: sale.discord_id,
      discord_tag: sale.discord_tag,
      provider: sale.provider,
      provider_charge_id: sale.provider_charge_id,
      paid_at: finalSale.paid_at,
      products: tagsBought
    }).catch(() => {});
  } catch {}

  return { ok: true, sale: db.prepare('SELECT * FROM sales WHERE id=?').get(sale.id), tagsBought };
}

function findOwnerForGuild(guildId) {
  try {
    if (guildId) {
      const r = db.prepare(`SELECT user_id FROM user_guilds WHERE guild_id=? AND role='owner' LIMIT 1`).get(guildId);
      if (r) return r.user_id;
    }
    const r = db.prepare(`SELECT id FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1`).get();
    return r?.id || null;
  } catch { return null; }
}

module.exports = { fulfillSale, computeExpiry, parseCart };
