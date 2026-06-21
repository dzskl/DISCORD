// Hold period escalonado.
// Vendedor "novato" -> dinheiro retido D+14 (anti-chargeback, anti-fraude).
// Vendedor "estabelecido" -> D+2.
//
// Criterios pra "established":
//   - conta com mais de NEW_ACCOUNT_DAYS dias E
//   - mais de ESTABLISHED_MIN_PAID_CENTS em vendas pagas historico

const { findSellerUserId, sellerPlanId } = require('../utils/seller-resolver');
const { getPlan } = require('./plans');

const HOLD_DAYS_NEW         = parseInt(process.env.HOLD_DAYS_NEW)         || 14;
const HOLD_DAYS_ESTABLISHED = parseInt(process.env.HOLD_DAYS_ESTABLISHED) || 2;
const NEW_ACCOUNT_DAYS      = parseInt(process.env.NEW_ACCOUNT_DAYS)      || 30;
const ESTABLISHED_MIN_PAID_CENTS = parseInt(process.env.ESTABLISHED_MIN_PAID_CENTS) || 100000; // R$ 1000

const DAY = 86400;

function classifySeller(db, userId) {
  if (!userId) return 'new';
  const u = db.prepare('SELECT created_at FROM users WHERE id=?').get(userId);
  if (!u) return 'new';
  const now = Math.floor(Date.now() / 1000);
  const accountAgeDays = (now - (u.created_at || now)) / DAY;
  if (accountAgeDays < NEW_ACCOUNT_DAYS) return 'new';

  // Soma vendas pagas historicas das guilds do user
  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(s.amount_cents), 0) AS v
    FROM sales s
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role = 'owner'
    WHERE ug.user_id = ? AND s.status = 'paid'
  `).get(userId).v;

  return totalPaid >= ESTABLISHED_MIN_PAID_CENTS ? 'established' : 'new';
}

function holdDaysFor(tier, planId) {
  // Plano sobrescreve tier (Scale=1, Pro=2, Starter=7 novato/2 estab, Free=14)
  if (planId) {
    const plan = getPlan(planId) || {};
    if (tier === 'established' && typeof plan.hold_days_established === 'number') return plan.hold_days_established;
    if (tier === 'new' && typeof plan.hold_days_new === 'number') return plan.hold_days_new;
  }
  return tier === 'established' ? HOLD_DAYS_ESTABLISHED : HOLD_DAYS_NEW;
}

// Marca a sale com available_at + hold_days + seller_tier.
// Chamada logo apos a sale virar 'paid'.
function applyHoldToSale(db, saleId) {
  const sale = db.prepare('SELECT id, status, paid_at, guild_id FROM sales WHERE id=?').get(saleId);
  if (!sale || sale.status !== 'paid') return null;
  const sellerId = findSellerUserId(db, sale);
  const tier = classifySeller(db, sellerId);
  const planId = sellerPlanId(db, sellerId);
  const days = holdDaysFor(tier, planId);
  const paidAt = sale.paid_at || Math.floor(Date.now() / 1000);
  const availableAt = paidAt + days * DAY;
  db.prepare(`UPDATE sales SET available_at=?, hold_days=?, seller_tier=? WHERE id=?`)
    .run(availableAt, days, tier, saleId);
  return { available_at: availableAt, hold_days: days, seller_tier: tier, plan: planId };
}

module.exports = {
  HOLD_DAYS_NEW,
  HOLD_DAYS_ESTABLISHED,
  NEW_ACCOUNT_DAYS,
  ESTABLISHED_MIN_PAID_CENTS,
  findSellerUserId,
  classifySeller,
  holdDaysFor,
  applyHoldToSale
};
