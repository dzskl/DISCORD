// Taxa da plataforma cobrada em cada venda paga.
// Modelo: percentual (6,5%) + taxa fixa (R$ 0,99).
// O owner recebe (amount - platform_fee_percent - platform_fixed_fee).
// O total coletado fica como receita da BotDash.
//
// Justificativa da taxa fixa: em vendas de ticket baixo (ex: R$ 5),
// 6,5% = R$ 0,33, que nao cobre custo de PIX (~R$ 0,10) + infra + suporte.
// A taxa fixa garante margem minima por transacao.

const PLATFORM_FEE_RATE = parseFloat(process.env.PLATFORM_FEE_RATE) || 0.065;       // 6,5%
const PLATFORM_FIXED_FEE_CENTS = parseInt(process.env.PLATFORM_FIXED_FEE_CENTS) || 99; // R$ 0,99

function calcPercentFee(amountCents) {
  return Math.round((amountCents || 0) * PLATFORM_FEE_RATE);
}

function calcFixedFee() {
  return PLATFORM_FIXED_FEE_CENTS;
}

function calcTotalFee(amountCents) {
  return calcPercentFee(amountCents) + calcFixedFee();
}

function applyFeeToSale(db, saleId) {
  const sale = db.prepare('SELECT amount_cents FROM sales WHERE id=?').get(saleId);
  if (!sale) return null;
  const percentFee = calcPercentFee(sale.amount_cents);
  const fixedFee = calcFixedFee();
  // Garante que o vendedor nunca receba negativo (em vendas micro de R$1 a fixa quebraria a conta)
  const totalFee = Math.min(sale.amount_cents - 1, percentFee + fixedFee);
  const adjustedFixed = Math.max(0, totalFee - percentFee);
  const net = sale.amount_cents - totalFee;
  db.prepare(`
    UPDATE sales SET
      platform_fee_cents = ?,
      platform_fixed_fee_cents = ?,
      platform_fee_rate = ?,
      net_to_owner_cents = ?
    WHERE id = ?
  `).run(percentFee, adjustedFixed, PLATFORM_FEE_RATE, net, saleId);
  return {
    percent_fee_cents: percentFee,
    fixed_fee_cents: adjustedFixed,
    total_fee_cents: totalFee,
    net_to_owner_cents: net,
    rate: PLATFORM_FEE_RATE
  };
}

// Mantida pra compat com codigo antigo (so percentual)
function calcFee(amountCents) {
  return calcPercentFee(amountCents);
}

module.exports = {
  PLATFORM_FEE_RATE,
  PLATFORM_FIXED_FEE_CENTS,
  calcFee,
  calcPercentFee,
  calcFixedFee,
  calcTotalFee,
  applyFeeToSale
};
