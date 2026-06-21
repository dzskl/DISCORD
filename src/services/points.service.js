// BotDash Points — cashback interno, lock-in puro.
// 1 ponto = 1 centavo. Pontos pagam: mensalidade, antecipacao, featured,
// badge, saque turbo. NUNCA vira dinheiro real.
//
// Earn:
//   - 1% de cada venda paga
//   - 5% de comissoes de referral
//   - eventos especiais
//
// Spend:
//   - mensalidade
//   - antecipacao (paga taxa em pontos)
//   - featured / badge / setup
//
// Tiers (so cosmeticos + perks pequenos):
//   - bronze:   0 pts
//   - prata:    5.000 pts (~R$ 50)
//   - ouro:     30.000 pts
//   - diamante: 100.000 pts

const TIER_THRESHOLDS = { bronze: 0, prata: 5000, ouro: 30000, diamante: 100000 };
const POINTS_PER_SALE_PCT = parseFloat(process.env.POINTS_PER_SALE_PCT) || 0.01; // 1%
const POINTS_PER_REFERRAL_PCT = parseFloat(process.env.POINTS_PER_REFERRAL_PCT) || 0.05;

function tierFor(lifetimeEarned) {
  if (lifetimeEarned >= TIER_THRESHOLDS.diamante) return 'diamante';
  if (lifetimeEarned >= TIER_THRESHOLDS.ouro)     return 'ouro';
  if (lifetimeEarned >= TIER_THRESHOLDS.prata)    return 'prata';
  return 'bronze';
}

function ensureRow(db, userId) {
  db.prepare(`INSERT OR IGNORE INTO user_points (user_id) VALUES (?)`).run(userId);
}

function getBalance(db, userId) {
  ensureRow(db, userId);
  return db.prepare('SELECT * FROM user_points WHERE user_id=?').get(userId);
}

// Credita pontos (delta > 0). Atualiza tier.
function credit(db, userId, points, reason, refType, refId) {
  if (!userId || !points || points <= 0) return null;
  return db.transaction(() => {
    ensureRow(db, userId);
    const cur = db.prepare('SELECT balance_points, lifetime_earned FROM user_points WHERE user_id=?').get(userId);
    const newBal = (cur.balance_points || 0) + points;
    const newLifetime = (cur.lifetime_earned || 0) + points;
    const tier = tierFor(newLifetime);
    db.prepare(`UPDATE user_points SET balance_points=?, lifetime_earned=?, tier=?, updated_at=strftime('%s','now') WHERE user_id=?`)
      .run(newBal, newLifetime, tier, userId);
    db.prepare(`INSERT INTO points_ledger (user_id, delta, reason, ref_type, ref_id, balance_after) VALUES (?,?,?,?,?,?)`)
      .run(userId, points, reason, refType || null, refId || null, newBal);
    return { balance: newBal, tier };
  })();
}

// Debita (delta > 0 mas registra como negativo). Falha se saldo insuficiente.
function debit(db, userId, points, reason, refType, refId) {
  if (!userId || !points || points <= 0) throw new Error('points invalido');
  return db.transaction(() => {
    ensureRow(db, userId);
    const cur = db.prepare('SELECT balance_points, lifetime_spent FROM user_points WHERE user_id=?').get(userId);
    if ((cur.balance_points || 0) < points) {
      throw new Error('saldo de pontos insuficiente');
    }
    const newBal = cur.balance_points - points;
    const newSpent = (cur.lifetime_spent || 0) + points;
    db.prepare(`UPDATE user_points SET balance_points=?, lifetime_spent=?, updated_at=strftime('%s','now') WHERE user_id=?`)
      .run(newBal, newSpent, userId);
    db.prepare(`INSERT INTO points_ledger (user_id, delta, reason, ref_type, ref_id, balance_after) VALUES (?,?,?,?,?,?)`)
      .run(userId, -points, reason, refType || null, refId || null, newBal);
    return { balance: newBal };
  })();
}

// Quanto credito gerar de uma venda (1% do net pro vendedor)
function pointsForSale(saleNetCents) {
  return Math.floor((saleNetCents || 0) * POINTS_PER_SALE_PCT);
}

function awardForSale(db, sellerUserId, saleId, netToOwnerCents) {
  const pts = pointsForSale(netToOwnerCents);
  if (pts > 0) return credit(db, sellerUserId, pts, 'sale', 'sale', saleId);
  return null;
}

function ledger(db, userId, limit = 100) {
  return db.prepare(`
    SELECT * FROM points_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

module.exports = {
  TIER_THRESHOLDS, POINTS_PER_SALE_PCT, POINTS_PER_REFERRAL_PCT,
  tierFor, getBalance, credit, debit, pointsForSale, awardForSale, ledger
};
