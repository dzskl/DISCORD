// Taxa da plataforma cobrada em cada venda paga.
// Modelo: percentual (varia por plano do vendedor) + taxa fixa (R$ 0,99).
//
//   - Free: 6,5% + R$ 0,99
//   - Pro:  4,5% + R$ 0,99 (vendedor paga R$ 49/mes pra ter essa taxa)
//
// O owner da plataforma recebe a comissao; o owner da guild (vendedor) recebe
// o net (amount - fee). Em vendas micro, a taxa fixa eh capada pra nao zerar
// o vendedor.

const { getPlan } = require('./plans');
const { findSellerUserId, sellerPlanId } = require('../utils/seller-resolver');

// Defaults globais — usados quando nao consegue resolver o plano do vendedor
const DEFAULT_RATE       = parseFloat(process.env.PLATFORM_FEE_RATE)        || 0.065;
const DEFAULT_FIXED_CENTS = parseInt(process.env.PLATFORM_FIXED_FEE_CENTS)   || 99;

// Mantida pra compat com codigo antigo
const PLATFORM_FEE_RATE = DEFAULT_RATE;
const PLATFORM_FIXED_FEE_CENTS = DEFAULT_FIXED_CENTS;

function getFeeParamsForPlan(planId) {
  const p = getPlan(planId) || {};
  return {
    rate: typeof p.commission_rate === 'number' ? p.commission_rate : DEFAULT_RATE,
    fixedCents: typeof p.fixed_fee_cents === 'number' ? p.fixed_fee_cents : DEFAULT_FIXED_CENTS
  };
}

function calcPercentFee(amountCents, rate = DEFAULT_RATE) {
  return Math.round((amountCents || 0) * rate);
}

function calcFixedFee(fixedCents = DEFAULT_FIXED_CENTS) {
  return fixedCents;
}

function calcTotalFee(amountCents, planId) {
  const { rate, fixedCents } = getFeeParamsForPlan(planId);
  return calcPercentFee(amountCents, rate) + fixedCents;
}

function applyFeeToSale(db, saleId) {
  const sale = db.prepare('SELECT id, amount_cents, guild_id FROM sales WHERE id=?').get(saleId);
  if (!sale) return null;

  // Resolve plano do vendedor pra escolher rate certo
  const sellerId = findSellerUserId(db, sale);
  const planId = sellerPlanId(db, sellerId);
  const { rate, fixedCents } = getFeeParamsForPlan(planId);

  const percentFee = calcPercentFee(sale.amount_cents, rate);
  // Garante que vendedor nunca recebe negativo
  const rawTotal = percentFee + fixedCents;
  const totalFee = Math.min(sale.amount_cents - 1, rawTotal);
  const adjustedFixed = Math.max(0, totalFee - percentFee);
  const net = sale.amount_cents - totalFee;

  db.prepare(`
    UPDATE sales SET
      platform_fee_cents = ?,
      platform_fixed_fee_cents = ?,
      platform_fee_rate = ?,
      net_to_owner_cents = ?
    WHERE id = ?
  `).run(percentFee, adjustedFixed, rate, net, saleId);
  return {
    seller_id: sellerId,
    seller_plan: planId,
    percent_fee_cents: percentFee,
    fixed_fee_cents: adjustedFixed,
    total_fee_cents: totalFee,
    net_to_owner_cents: net,
    rate
  };
}

// Compat
function calcFee(amountCents) {
  return calcPercentFee(amountCents, DEFAULT_RATE);
}

module.exports = {
  PLATFORM_FEE_RATE,
  PLATFORM_FIXED_FEE_CENTS,
  DEFAULT_RATE,
  DEFAULT_FIXED_CENTS,
  calcFee,
  calcPercentFee,
  calcFixedFee,
  calcTotalFee,
  getFeeParamsForPlan,
  applyFeeToSale
};
