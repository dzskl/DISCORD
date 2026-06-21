// Antecipacao de recebiveis: vendedor "compra" o dinheiro em hold.
// A taxa cobrada eh receita 100% margem pra plataforma.
// Modelo Hotmart/Kiwify "saque antecipado".

const RATE_DEFAULT = parseFloat(process.env.ADVANCE_FEE_RATE) || 0.0299;        // 2,99%
const MIN_GROSS    = parseInt(process.env.ADVANCE_MIN_GROSS_CENTS) || 5000;     // R$ 50 minimo
const ENABLED      = process.env.ADVANCE_ENABLED !== '0';

function calcFee(grossCents, rate = RATE_DEFAULT) {
  return Math.round(grossCents * rate);
}

module.exports = { RATE_DEFAULT, MIN_GROSS, ENABLED, calcFee };
