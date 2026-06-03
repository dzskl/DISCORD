// Saldo + saques.
// Saldo = SUM(sales pagas - cost_cents) - SUM(saques pending/approved/paid)
// So pode sacar com user_verifications.status='approved'.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

const WITHDRAW_FEE = { normal: 50, instant: 350 };  // R$ 0,50 / R$ 3,50
const WITHDRAW_MIN_CENTS = 1000;      // R$10 minimo

function balanceFor(userId, guildId) {
  const gFilter = guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const gArgs = guildId ? [guildId] : [];

  const earned = db.prepare(`
    SELECT COALESCE(SUM(s.amount_cents - COALESCE(p.cost_cents,0)), 0) AS v
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.status = 'paid' ${gFilter}
  `).get(...gArgs).v;

  const wFilter = guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const wArgs = guildId ? [guildId] : [];
  const withdrawn = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS v
    FROM withdrawals WHERE user_id = ? AND status IN ('pending','approved','paid') ${wFilter}
  `).get(userId, ...wArgs).v;

  return { earned_cents: earned, withdrawn_cents: withdrawn, available_cents: Math.max(0, earned - withdrawn) };
}

router.get('/balance', (req, res) => {
  const b = balanceFor(req.appUser.id, req.guildId);
  const pending = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status='pending'
  `).get(req.appUser.id).v;
  const blocked = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status='approved'
  `).get(req.appUser.id).v;
  res.json({ ...b, pending_cents: pending, blocked_cents: blocked });
});

router.get('/withdrawals', (req, res) => {
  const rows = db.prepare(`SELECT * FROM withdrawals WHERE user_id=? ORDER BY requested_at DESC LIMIT 100`).all(req.appUser.id);
  res.json(rows);
});

router.post('/withdraw', (req, res) => {
  const { amount, type } = req.body || {};
  const withdrawType = type === 'instant' ? 'instant' : 'normal';
  const cents = Math.round(parseFloat(amount) * 100);
  if (!(cents >= WITHDRAW_MIN_CENTS)) {
    return res.status(400).json({ error: `valor minimo de saque: R$ ${(WITHDRAW_MIN_CENTS / 100).toFixed(2)}` });
  }

  // Precisa estar verificado
  const verif = db.prepare('SELECT * FROM user_verifications WHERE user_id=?').get(req.appUser.id);
  if (!verif || verif.status !== 'approved') {
    return res.status(403).json({ error: 'verificacao de identidade pendente', verification_required: true });
  }

  const bal = balanceFor(req.appUser.id, req.guildId);
  if (cents > bal.available_cents) {
    return res.status(400).json({ error: 'saldo insuficiente' });
  }

  const fee = WITHDRAW_FEE[withdrawType];
  const net = cents - fee;

  const info = db.prepare(`
    INSERT INTO withdrawals (user_id, guild_id, amount_cents, pix_key, pix_key_type, status, fee_cents, net_cents, withdraw_type)
    VALUES (?,?,?,?,?, 'pending', ?, ?, ?)
  `).run(req.appUser.id, req.guildId || null, cents, verif.pix_key, detectPixKeyType(verif.pix_key), fee, net, withdrawType);

  audit.log({ req, action: 'wallet.withdraw_request', target_type: 'withdrawal', target_id: info.lastInsertRowid, details: { amount_cents: cents } });

  db.prepare(`INSERT INTO notifications (user_id,guild_id,kind,title,body) VALUES (?,?,?,?,?)`)
    .run(req.appUser.id, req.guildId || null, 'withdrawal',
      `Saque solicitado: R$ ${(net / 100).toFixed(2).replace('.', ',')}`,
      withdrawType === 'instant'
        ? 'Saque instantâneo — será processado em minutos.'
        : 'Saque normal — será processado em até 24h úteis.');

  res.json(db.prepare('SELECT * FROM withdrawals WHERE id=?').get(info.lastInsertRowid));
});

function detectPixKeyType(key) {
  const k = String(key).replace(/\D/g, '');
  if (/^\d{11}$/.test(k)) return 'cpf';
  if (/^\d{14}$/.test(k)) return 'cnpj';
  if (/^\d{10,11}$/.test(k) && k.startsWith('55') === false && k.length >= 10) return 'phone';
  if (/@/.test(key)) return 'email';
  return 'random';
}

module.exports = router;
