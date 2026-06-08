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
  const now = Math.floor(Date.now() / 1000);

  // Receita TOTAL = NET pro dono (apos % + fixa) - custo do produto
  // COALESCE: vendas antigas sem net_to_owner_cents usam amount_cents (compat)
  const earned = db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(s.net_to_owner_cents, 0), s.amount_cents) - COALESCE(p.cost_cents, 0)
    ), 0) AS v
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.status = 'paid' ${gFilter}
  `).get(...gArgs).v;

  // Receita LIBERADA = vendas em que ja passou o hold period (available_at <= now ou nulo)
  const released = db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(s.net_to_owner_cents, 0), s.amount_cents) - COALESCE(p.cost_cents, 0)
    ), 0) AS v
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.status = 'paid' AND (s.available_at IS NULL OR s.available_at <= ?) ${gFilter}
  `).get(now, ...gArgs).v;

  // Receita EM HOLD = vendas pagas mas ainda em hold period
  const pendingRelease = db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(s.net_to_owner_cents, 0), s.amount_cents) - COALESCE(p.cost_cents, 0)
    ), 0) AS v
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.status = 'paid' AND s.available_at > ? ${gFilter}
  `).get(now, ...gArgs).v;

  // Soma de taxas pagas pra plataforma (transparencia pro owner)
  const platformFees = db.prepare(`
    SELECT COALESCE(SUM(s.platform_fee_cents + COALESCE(s.platform_fixed_fee_cents, 0)), 0) AS v
    FROM sales s
    WHERE s.status = 'paid' ${gFilter}
  `).get(...gArgs).v;

  const wFilter = guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const wArgs = guildId ? [guildId] : [];
  const withdrawn = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS v
    FROM withdrawals WHERE user_id = ? AND status IN ('pending','approved','paid') ${wFilter}
  `).get(userId, ...wArgs).v;

  const pf = require('../config/platform-fee');
  const hp = require('../config/hold-period');
  const cb = require('../config/chargeback-reserve');
  const reserve = cb.calcReserveFor(db, userId, guildId);
  const available = Math.max(0, released - withdrawn - reserve);

  return {
    earned_cents: earned,
    withdrawn_cents: withdrawn,
    available_cents: available,
    pending_release_cents: Math.max(0, pendingRelease),
    chargeback_reserve_cents: reserve,
    platform_fees_cents: platformFees,
    platform_fee_rate: pf.PLATFORM_FEE_RATE,
    platform_fixed_fee_cents: pf.PLATFORM_FIXED_FEE_CENTS,
    hold_days_new: hp.HOLD_DAYS_NEW,
    hold_days_established: hp.HOLD_DAYS_ESTABLISHED,
    chargeback_reserve_rate: cb.RATE,
    chargeback_reserve_window_days: cb.WINDOW_DAYS
  };
}

router.get('/balance', (req, res) => {
  const b = balanceFor(req.appUser.id, req.guildId);
  const pending = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status='pending'
  `).get(req.appUser.id).v;
  const blocked = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status='approved'
  `).get(req.appUser.id).v;
  const med = db.prepare(`
    SELECT COALESCE(SUM(med_blocked_cents),0) AS v FROM withdrawals WHERE user_id=?
  `).get(req.appUser.id).v;
  // 2FA
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.appUser.id);
  res.json({
    ...b,
    pending_cents: pending,
    blocked_cents: blocked,
    med_blocked_cents: med,
    total_cents: b.earned_cents,
    twofa_enabled: !!(u?.totp_enabled),
    twofa_verified: !!(req.session?.twofa_verified_at && (Math.floor(Date.now() / 1000) - req.session.twofa_verified_at < 600))
  });
});

router.post('/extract-email', (req, res) => {
  // placeholder: chama servico de email com extrato
  try {
    const email = require('../services/email.service');
    if (!email.isConfigured()) return res.status(503).json({ error: 'SMTP nao configurado' });
    const rows = db.prepare(`SELECT * FROM withdrawals WHERE user_id=? ORDER BY requested_at DESC LIMIT 200`).all(req.appUser.id);
    const u = db.prepare('SELECT email FROM users WHERE id=?').get(req.appUser.id);
    if (!u?.email) return res.status(400).json({ error: 'email do user nao definido' });
    email.send({
      to: u.email,
      subject: 'Extrato BotDash',
      html: `<h3>Seu extrato</h3><p>Total de ${rows.length} saques.</p><table border="1"><tr><th>Data</th><th>Valor</th><th>Status</th></tr>${rows.map(r => `<tr><td>${new Date(r.requested_at * 1000).toLocaleString('pt-BR')}</td><td>R$ ${(r.amount_cents / 100).toFixed(2)}</td><td>${r.status}</td></tr>`).join('')}</table>`
    }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/withdrawals', (req, res) => {
  const rows = db.prepare(`SELECT * FROM withdrawals WHERE user_id=? ORDER BY requested_at DESC LIMIT 100`).all(req.appUser.id);
  res.json(rows);
});

// Vendas em hold (proximas liberacoes) pro vendedor
router.get('/holds', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const gFilter = req.guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const gArgs = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`
    SELECT s.id, s.amount_cents, s.net_to_owner_cents, s.paid_at, s.available_at, s.hold_days, s.seller_tier,
           p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE s.status = 'paid' AND s.available_at IS NOT NULL AND s.available_at > ? ${gFilter}
    ORDER BY s.available_at ASC LIMIT 200
  `).all(now, ...gArgs);
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

// ============ ADMIN (owner) ============
const { requireOwner } = require('../middlewares/auth.middleware');

router.get('/admin/withdrawals', requireOwner, (req, res) => {
  const status = req.query.status;
  const where = status ? 'WHERE w.status=?' : '';
  const args = status ? [status] : [];
  const rows = db.prepare(`
    SELECT w.*, u.email, u.display_name, u.discord_tag, u.discord_avatar
    FROM withdrawals w
    JOIN users u ON u.id = w.user_id
    ${where}
    ORDER BY
      CASE w.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 WHEN 'paid' THEN 3 ELSE 4 END,
      w.requested_at DESC
    LIMIT 200
  `).all(...args);
  res.json(rows);
});

router.post('/admin/withdrawals/:id/review', requireOwner, (req, res) => {
  const { action, reason, external_tx_id } = req.body || {};
  const w = db.prepare('SELECT * FROM withdrawals WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'nao encontrado' });
  if (w.status !== 'pending' && w.status !== 'approved') return res.status(400).json({ error: 'saque ja finalizado' });

  if (action === 'approve') {
    db.prepare(`UPDATE withdrawals SET status='approved', processed_at=strftime('%s','now') WHERE id=?`).run(w.id);
    db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'withdrawal', 'Saque aprovado', 'Seu saque foi aprovado e sera transferido em breve.')`).run(w.user_id);
  } else if (action === 'paid') {
    db.prepare(`UPDATE withdrawals SET status='paid', processed_at=strftime('%s','now'), external_tx_id=? WHERE id=?`).run(external_tx_id || null, w.id);
    db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'withdrawal', '💸 Saque pago!', ?)`).run(w.user_id, `R$ ${(w.net_cents / 100).toFixed(2).replace('.', ',')} enviado pra sua chave PIX.`);
  } else if (action === 'reject') {
    db.prepare(`UPDATE withdrawals SET status='rejected', processed_at=strftime('%s','now'), reason=? WHERE id=?`).run(reason || null, w.id);
    db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'warning', 'Saque rejeitado', ?)`).run(w.user_id, reason || 'Sem motivo especificado');
  } else {
    return res.status(400).json({ error: 'action invalido (approve|paid|reject)' });
  }
  audit.log({ req, action: `wallet.${action}`, target_type: 'withdrawal', target_id: w.id });
  res.json({ ok: true });
});

// Receita total da plataforma — % + taxa fixa
router.get('/admin/platform-revenue', requireOwner, (req, res) => {
  const percent = db.prepare(`SELECT COALESCE(SUM(platform_fee_cents),0) AS v FROM sales WHERE status='paid'`).get().v;
  const fixed = db.prepare(`SELECT COALESCE(SUM(COALESCE(platform_fixed_fee_cents,0)),0) AS v FROM sales WHERE status='paid'`).get().v;
  const sales = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status='paid' AND (platform_fee_cents > 0 OR COALESCE(platform_fixed_fee_cents,0) > 0)`).get().c;
  const gross = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid'`).get().v;
  const now = Math.floor(Date.now()/1000);
  const monthStart = now - 30 * 86400;
  const monthPercent = db.prepare(`SELECT COALESCE(SUM(platform_fee_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(monthStart).v;
  const monthFixed = db.prepare(`SELECT COALESCE(SUM(COALESCE(platform_fixed_fee_cents,0)),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(monthStart).v;
  const pf = require('../config/platform-fee');
  res.json({
    total_collected_cents: percent + fixed,
    percent_collected_cents: percent,
    fixed_collected_cents: fixed,
    sales_with_fee: sales,
    gross_volume_cents: gross,
    month_collected_cents: monthPercent + monthFixed,
    month_percent_cents: monthPercent,
    month_fixed_cents: monthFixed,
    fee_rate: pf.PLATFORM_FEE_RATE,
    fixed_fee_cents: pf.PLATFORM_FIXED_FEE_CENTS
  });
});

// Vendas suspeitas (fraud_score >= threshold)
router.get('/admin/suspicious-sales', requireOwner, (req, res) => {
  const { getConfig } = require('../database/connection');
  const t = parseInt(getConfig().fraud_threshold) || 60;
  const rows = db.prepare(`
    SELECT s.id, s.discord_id, s.discord_tag, s.amount_cents, s.status, s.created_at,
           s.fraud_score, s.fraud_signals, s.last_ip, p.name AS product_name
    FROM sales s LEFT JOIN products p ON p.id=s.product_id
    WHERE s.fraud_score >= ?
    ORDER BY s.fraud_score DESC, s.created_at DESC
    LIMIT 100
  `).all(t);
  res.json(rows);
});

module.exports = router;
