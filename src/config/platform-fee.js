// Taxa da plataforma cobrada em cada venda paga.
// O owner recebe (amount - platform_fee). O valor coletado fica como
// receita da BotDash.

const PLATFORM_FEE_RATE = parseFloat(process.env.PLATFORM_FEE_RATE) || 0.065; // 6.5%

function calcFee(amountCents) {
  return Math.round((amountCents || 0) * PLATFORM_FEE_RATE);
}

function applyFeeToSale(db, saleId) {
  const sale = db.prepare('SELECT amount_cents FROM sales WHERE id=?').get(saleId);
  if (!sale) return null;
  const fee = calcFee(sale.amount_cents);
  const net = sale.amount_cents - fee;
  db.prepare(`
    UPDATE sales SET
      platform_fee_cents = ?,
      platform_fee_rate = ?,
      net_to_owner_cents = ?
    WHERE id = ?
  `).run(fee, PLATFORM_FEE_RATE, net, saleId);
  return { fee_cents: fee, net_to_owner_cents: net, rate: PLATFORM_FEE_RATE };
}

module.exports = { PLATFORM_FEE_RATE, calcFee, applyFeeToSale };
