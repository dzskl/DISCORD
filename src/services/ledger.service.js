// Ledger contabil double-entry.
// Toda movimentacao financeira passa por aqui. Soma sempre zera.
//
// Modelo de contas:
//   user:{id}:available     — sacavel
//   user:{id}:hold          — em retencao
//   user:{id}:reserve       — reserva chargeback
//   platform:revenue        — receita BotDash (percent + fixa + advance + featured + badge)
//   platform:withdrawals    — saidas PIX out
//   platform:reserves       — pool de reservas
//   external:gateway        — entrada via gateway
//   external:refunds        — saidas por refund
//
// Exemplo venda paga (R$ 100, fee R$ 9,39, hold D+14):
//   transaction_id: sale-123
//   debit  external:gateway        10000  ← dinheiro entrou
//   credit user:42:hold             9061  ← parte do vendedor em hold
//   credit platform:revenue          939  ← receita BotDash
//   (soma: -10000 + 9061 + 939 = 0 ✓)
//
// Quando libera (hold → available):
//   debit  user:42:hold      9061
//   credit user:42:available 9061
//
// Saque (R$ 50 net):
//   debit  user:42:available 5050  (5000 net + 50 fee)
//   credit user:42:withdrawals 5000  → vira withdrawal record
//   credit platform:revenue   50

const crypto = require('crypto');

function accountUser(userId, kind) { return `user:${userId}:${kind}`; }

// Post double-entry. entries = [{ account, direction, amount_cents, ... }]
// Valida que soma zera.
function post(db, transactionId, entries, meta = {}) {
  if (!entries || entries.length < 2) throw new Error('ledger precisa de no minimo 2 entries');
  let net = 0;
  for (const e of entries) {
    if (!e.account || !e.direction || !e.amount_cents) throw new Error('entry invalida');
    if (e.amount_cents <= 0) throw new Error('amount_cents deve ser > 0');
    net += e.direction === 'debit' ? -e.amount_cents : e.amount_cents;
  }
  if (net !== 0) throw new Error(`ledger nao zera: net=${net}`);

  const txId = transactionId || crypto.randomBytes(8).toString('hex');
  return db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO ledger_entries
        (transaction_id, account, direction, amount_cents, signed_amount, ref_type, ref_id, user_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of entries) {
      const signed = e.direction === 'debit' ? -e.amount_cents : e.amount_cents;
      stmt.run(
        txId, e.account, e.direction, e.amount_cents, signed,
        meta.ref_type || e.ref_type || null,
        meta.ref_id || e.ref_id || null,
        meta.user_id || e.user_id || null,
        meta.description || e.description || null
      );
    }
    return txId;
  })();
}

// Saldo de uma conta = SUM(signed_amount)
function balance(db, account) {
  const r = db.prepare(`SELECT COALESCE(SUM(signed_amount),0) AS v FROM ledger_entries WHERE account=?`).get(account);
  return r.v;
}

function userBalances(db, userId) {
  return {
    available: balance(db, accountUser(userId, 'available')),
    hold:      balance(db, accountUser(userId, 'hold')),
    reserve:   balance(db, accountUser(userId, 'reserve'))
  };
}

// Helper: registra venda paga
function recordSale(db, sale, fee, holdDays) {
  if (!sale || !fee) return null;
  const sellerId = fee.seller_id;
  if (!sellerId) return null;
  const platformFee = (fee.percent_fee_cents || 0) + (fee.fixed_fee_cents || 0);
  const net = fee.net_to_owner_cents || 0;
  const target = holdDays > 0 ? accountUser(sellerId, 'hold') : accountUser(sellerId, 'available');
  return post(db, `sale-${sale.id}`, [
    { account: 'external:gateway',  direction: 'debit',  amount_cents: sale.amount_cents },
    { account: target,              direction: 'credit', amount_cents: net },
    { account: 'platform:revenue',  direction: 'credit', amount_cents: platformFee }
  ], { ref_type: 'sale', ref_id: sale.id, user_id: sellerId, description: 'Venda paga' });
}

// Helper: libera hold → available
function releaseHold(db, userId, amount, saleId) {
  return post(db, `release-${saleId}`, [
    { account: accountUser(userId, 'hold'),      direction: 'debit',  amount_cents: amount },
    { account: accountUser(userId, 'available'), direction: 'credit', amount_cents: amount }
  ], { ref_type: 'sale_release', ref_id: saleId, user_id: userId, description: 'Hold liberado' });
}

// Helper: saque (debita available, registra withdrawal)
function recordWithdrawal(db, userId, withdrawalId, amountCents, feeCents) {
  const netCents = amountCents - feeCents;
  return post(db, `withdraw-${withdrawalId}`, [
    { account: accountUser(userId, 'available'), direction: 'debit',  amount_cents: amountCents },
    { account: 'platform:withdrawals',           direction: 'credit', amount_cents: netCents },
    { account: 'platform:revenue',               direction: 'credit', amount_cents: feeCents }
  ], { ref_type: 'withdrawal', ref_id: withdrawalId, user_id: userId, description: 'Saque PIX' });
}

// Helper: antecipacao
function recordAdvance(db, userId, advanceId, grossCents, feeCents) {
  const netCents = grossCents - feeCents;
  // Move da hold pra available, taxa vira receita
  return post(db, `advance-${advanceId}`, [
    { account: accountUser(userId, 'hold'),      direction: 'debit',  amount_cents: grossCents },
    { account: accountUser(userId, 'available'), direction: 'credit', amount_cents: netCents },
    { account: 'platform:revenue',               direction: 'credit', amount_cents: feeCents }
  ], { ref_type: 'advance', ref_id: advanceId, user_id: userId, description: 'Antecipacao recebiveis' });
}

// Helper: ajuste manual (admin)
function adjust(db, userId, kind, amount, description) {
  return post(db, `adjust-${Date.now()}-${userId}`, [
    { account: 'platform:revenue',            direction: amount > 0 ? 'debit' : 'credit', amount_cents: Math.abs(amount) },
    { account: accountUser(userId, kind),     direction: amount > 0 ? 'credit' : 'debit', amount_cents: Math.abs(amount) }
  ], { ref_type: 'adjustment', user_id: userId, description: description || 'Ajuste manual' });
}

// Soma de receita plataforma por periodo
function platformRevenue(db, sinceTs) {
  const where = sinceTs ? `AND created_at >= ?` : '';
  const args = sinceTs ? [sinceTs] : [];
  return db.prepare(`SELECT COALESCE(SUM(signed_amount),0) AS v FROM ledger_entries WHERE account='platform:revenue' ${where}`).get(...args).v;
}

module.exports = {
  accountUser, post, balance, userBalances,
  recordSale, releaseHold, recordWithdrawal, recordAdvance, adjust,
  platformRevenue
};
