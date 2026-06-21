// Job de saque automatico (1x por dia).
// Para cada vendedor com auto_withdraw_enabled=1 e tier 'established':
//   1. Calcula saldo disponivel
//   2. Se >= auto_withdraw_min_cents E houver chave PIX verificada
//   3. Cria uma withdrawal pending (status normal, fee R$ 0,50)
//
// Nao processa o pagamento real. Owner ainda aprova manualmente
// no painel admin. Diferenca pro vendedor: nao precisa clicar "Sacar"
// toda semana.

const { db, logEvent } = require('../database/connection');
const logger = require('../utils/logger');

const WITHDRAW_FEE_CENTS = 50;
const AUTO_WITHDRAW_MIN_FLOOR = 5000;

async function run() {
  const hp = require('../config/hold-period');
  const now = Math.floor(Date.now() / 1000);

  const candidates = db.prepare(`
    SELECT u.id, u.auto_withdraw_min_cents
    FROM users u
    WHERE u.auto_withdraw_enabled = 1
      AND u.active = 1
  `).all();

  let created = 0, skipped = 0;
  for (const u of candidates) {
    try {
      // So vendedor estabelecido pode usar
      if (hp.classifySeller(db, u.id) !== 'established') { skipped++; continue; }

      // Tem chave PIX verificada?
      const verif = db.prepare('SELECT pix_key, status FROM user_verifications WHERE user_id=?').get(u.id);
      if (!verif || verif.status !== 'approved' || !verif.pix_key) { skipped++; continue; }

      // Ja tem withdrawal pending? evita duplicar
      const pendingExisting = db.prepare(`SELECT 1 FROM withdrawals WHERE user_id=? AND status='pending' LIMIT 1`).get(u.id);
      if (pendingExisting) { skipped++; continue; }

      // Calcula saldo disponivel
      const released = db.prepare(`
        SELECT COALESCE(SUM(COALESCE(NULLIF(s.net_to_owner_cents,0), s.amount_cents) - COALESCE(p.cost_cents,0)),0) AS v
        FROM sales s LEFT JOIN products p ON p.id=s.product_id
        JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
        WHERE ug.user_id=? AND s.status='paid' AND (s.available_at IS NULL OR s.available_at <= ?)
      `).get(u.id, now).v;
      const withdrawn = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status IN ('pending','approved','paid')`).get(u.id).v;
      const advFees = db.prepare(`SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE user_id=? AND status='applied'`).get(u.id).v;
      let featSpent = 0, badgeSpent = 0;
      try { featSpent = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE user_id=? AND paid_via='balance' AND status!='cancelled'`).get(u.id).v; } catch {}
      try { badgeSpent = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments WHERE user_id=? AND paid_via='balance'`).get(u.id).v; } catch {}

      const cb = require('../config/chargeback-reserve');
      const reserve = cb.calcReserveFor(db, u.id, null);
      const available = Math.max(0, released - withdrawn - advFees - featSpent - badgeSpent - reserve);

      const min = Math.max(AUTO_WITHDRAW_MIN_FLOOR, u.auto_withdraw_min_cents || AUTO_WITHDRAW_MIN_FLOOR);
      if (available < min) { skipped++; continue; }

      const net = available - WITHDRAW_FEE_CENTS;
      db.prepare(`
        INSERT INTO withdrawals (user_id, amount_cents, pix_key, pix_key_type, status, fee_cents, net_cents, withdraw_type)
        VALUES (?,?,?,?, 'pending', ?, ?, 'normal')
      `).run(u.id, available, verif.pix_key, 'auto', WITHDRAW_FEE_CENTS, net);

      db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'withdrawal', 'Saque automatico criado', ?)`)
        .run(u.id, `R$ ${(net/100).toFixed(2).replace('.', ',')} agendado pra transferencia`);

      logEvent({ type: 'saque', message: `Saque automatico user ${u.id}: R$ ${(available/100).toFixed(2)}` });
      created++;
    } catch (e) {
      logger.warn({ err: e.message, user_id: u.id }, 'auto-withdraw falhou pra user');
    }
  }

  if (candidates.length > 0) {
    logger.info({ candidates: candidates.length, created, skipped }, 'auto-withdraw job rodou');
  }
  return { candidates: candidates.length, created, skipped };
}

module.exports = { run };
