// Camada B de afiliados: vendedor traz outro vendedor.
// Referrer ganha 20% da receita BotDash do referee por 365 dias.
// Pago em pontos por padrao (lock-in) ou em cash via saldo.

const crypto = require('crypto');

const DEFAULT_REV_SHARE = parseFloat(process.env.REFERRAL_REV_SHARE) || 0.20;
const DURATION_DAYS = parseInt(process.env.REFERRAL_DURATION_DAYS) || 365;
const PAYOUT_MODE = (process.env.REFERRAL_PAYOUT || 'points').toLowerCase(); // points | cash

const DAY = 86400;

function generateCode(db, userId) {
  // Garante uniqueness — tenta ate 5 vezes
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    try {
      db.prepare(`INSERT INTO referral_codes (user_id, code) VALUES (?, ?)`).run(userId, code);
      return code;
    } catch (e) {
      if (i === 4) throw e;
    }
  }
}

function getOrCreateCode(db, userId) {
  const existing = db.prepare(`SELECT code FROM referral_codes WHERE user_id=? AND active=1 LIMIT 1`).get(userId);
  if (existing) return existing.code;
  return generateCode(db, userId);
}

function validateCode(db, code) {
  if (!code) return null;
  return db.prepare(`SELECT * FROM referral_codes WHERE code=? AND active=1`).get(code.toUpperCase());
}

// Vincula um referee a um referrer. Idempotente: se ja vinculado, retorna existente.
function linkReferee(db, refereeUserId, code) {
  const cleanCode = String(code || '').toUpperCase().trim();
  if (!cleanCode) return null;
  const codeRow = validateCode(db, cleanCode);
  if (!codeRow) return null;
  if (codeRow.user_id === refereeUserId) return null; // auto-referral bloqueado

  const existing = db.prepare(`SELECT id FROM referral_relationships WHERE referee_user_id=?`).get(refereeUserId);
  if (existing) return existing.id;

  const now = Math.floor(Date.now() / 1000);
  const info = db.prepare(`
    INSERT INTO referral_relationships (referrer_user_id, referee_user_id, code_used, rev_share_pct, starts_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(codeRow.user_id, refereeUserId, cleanCode, DEFAULT_REV_SHARE, now, now + DURATION_DAYS * DAY);

  db.prepare(`UPDATE referral_codes SET total_referred = total_referred + 1 WHERE id=?`).run(codeRow.id);
  db.prepare(`UPDATE users SET referred_by_code=?, referred_at=? WHERE id=?`).run(cleanCode, now, refereeUserId);

  return info.lastInsertRowid;
}

// Quando uma venda paga gera receita plataforma, paga a comissao do referrer.
// platformRevenueCents = % + fixa que ficaram com a BotDash.
function payCommissionFromSale(db, refereeUserId, saleId, platformRevenueCents) {
  if (!platformRevenueCents || platformRevenueCents <= 0) return null;
  const now = Math.floor(Date.now() / 1000);
  const rel = db.prepare(`
    SELECT * FROM referral_relationships
    WHERE referee_user_id=? AND status='active' AND ends_at > ?
  `).get(refereeUserId, now);
  if (!rel) return null;

  const commission = Math.round(platformRevenueCents * rel.rev_share_pct);
  if (commission <= 0) return null;

  return db.transaction(() => {
    db.prepare(`
      INSERT INTO referral_commissions (relationship_id, source_sale_id, platform_revenue_cents, commission_cents, paid_in)
      VALUES (?, ?, ?, ?, ?)
    `).run(rel.id, saleId, platformRevenueCents, commission, PAYOUT_MODE);

    db.prepare(`UPDATE referral_relationships SET total_paid_cents = total_paid_cents + ? WHERE id=?`)
      .run(commission, rel.id);

    db.prepare(`UPDATE referral_codes SET total_earned_cents = total_earned_cents + ? WHERE code=?`)
      .run(commission, rel.code_used);

    // Pagamento: pontos (default) ou cash via ledger (a implementar)
    if (PAYOUT_MODE === 'points') {
      const points = require('./points.service');
      points.credit(db, rel.referrer_user_id, commission, 'referral', 'sale', saleId);
    }
    return { commission_cents: commission, mode: PAYOUT_MODE, referrer_user_id: rel.referrer_user_id };
  })();
}

function statsForReferrer(db, userId) {
  const code = db.prepare(`SELECT * FROM referral_codes WHERE user_id=? AND active=1 LIMIT 1`).get(userId);
  const rels = db.prepare(`
    SELECT rr.*, u.email AS referee_email, u.display_name AS referee_name, u.plan AS referee_plan
    FROM referral_relationships rr
    JOIN users u ON u.id = rr.referee_user_id
    WHERE rr.referrer_user_id = ?
    ORDER BY rr.created_at DESC
  `).all(userId);
  const recent = db.prepare(`
    SELECT rc.*, s.amount_cents AS sale_amount
    FROM referral_commissions rc
    LEFT JOIN sales s ON s.id = rc.source_sale_id
    WHERE rc.relationship_id IN (SELECT id FROM referral_relationships WHERE referrer_user_id = ?)
    ORDER BY rc.created_at DESC LIMIT 50
  `).all(userId);
  return { code: code?.code || null, total_referred: code?.total_referred || 0, total_earned_cents: code?.total_earned_cents || 0, relationships: rels, recent_commissions: recent, payout_mode: PAYOUT_MODE };
}

module.exports = {
  DEFAULT_REV_SHARE, DURATION_DAYS, PAYOUT_MODE,
  generateCode, getOrCreateCode, validateCode,
  linkReferee, payCommissionFromSale, statsForReferrer
};
