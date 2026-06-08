// Reserva rolante anti-chargeback.
// Modelo Stripe/PayPal: X% das vendas dos ultimos N dias ficam bloqueados
// como buffer. Se rolar chargeback/refund, a reserva absorve sem afetar
// outros vendedores. O dinheiro nao some - so eh travado pra saque.
//
// O cliente VE a reserva no extrato pra transparencia.

const RATE        = parseFloat(process.env.CHARGEBACK_RESERVE_RATE) || 0.05; // 5%
const WINDOW_DAYS = parseInt(process.env.CHARGEBACK_RESERVE_WINDOW_DAYS) || 30;
const ENABLED     = process.env.CHARGEBACK_RESERVE_ENABLED !== '0';

const DAY = 86400;

function calcReserveFor(db, userId, guildId) {
  if (!ENABLED) return 0;
  const now = Math.floor(Date.now() / 1000);
  const since = now - WINDOW_DAYS * DAY;

  const gFilter = guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const gArgs = guildId ? [guildId] : [];

  // Soma vendas pagas nos ultimos N dias do vendedor (via guilds que ele eh owner)
  const sum = db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(s.net_to_owner_cents, 0), s.amount_cents)
    ), 0) AS v
    FROM sales s
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role = 'owner'
    WHERE ug.user_id = ?
      AND s.status = 'paid'
      AND s.paid_at >= ?
      ${gFilter}
  `).get(userId, since, ...gArgs).v;

  return Math.round(sum * RATE);
}

module.exports = {
  RATE,
  WINDOW_DAYS,
  ENABLED,
  calcReserveFor
};
