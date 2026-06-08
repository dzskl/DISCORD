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

  // Taxas de antecipacao ja pagas (descontadas do saldo final)
  const advFilter = guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const advArgs = guildId ? [guildId] : [];
  const advanceFeesPaid = db.prepare(`
    SELECT COALESCE(SUM(fee_cents), 0) AS v
    FROM advance_requests WHERE user_id=? AND status='applied' ${advFilter}
  `).get(userId, ...advArgs).v;

  // Featured products pagos via saldo (descontados)
  const featFilter = guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const featArgs = guildId ? [guildId] : [];
  let featuredSpent = 0;
  try {
    featuredSpent = db.prepare(`
      SELECT COALESCE(SUM(price_cents), 0) AS v
      FROM featured_products
      WHERE user_id=? AND paid_via='balance' AND status!='cancelled' ${featFilter}
    `).get(userId, ...featArgs).v;
  } catch { /* tabela pode nao existir ainda */ }

  // Selos Verificado pagos via saldo
  let badgeSpent = 0;
  try {
    badgeSpent = db.prepare(`
      SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments
      WHERE user_id=? AND paid_via='balance'
    `).get(userId).v;
  } catch {}

  const pf = require('../config/platform-fee');
  const hp = require('../config/hold-period');
  const cb = require('../config/chargeback-reserve');
  const reserve = cb.calcReserveFor(db, userId, guildId);
  const available = Math.max(0, released - withdrawn - reserve - advanceFeesPaid - featuredSpent - badgeSpent);

  return {
    earned_cents: earned,
    withdrawn_cents: withdrawn,
    available_cents: available,
    pending_release_cents: Math.max(0, pendingRelease),
    chargeback_reserve_cents: reserve,
    advance_fees_paid_cents: advanceFeesPaid,
    featured_spent_cents: featuredSpent,
    badge_spent_cents: badgeSpent,
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

// Preview da antecipacao: mostra quanto sai liquido pro vendedor se antecipar
// TODAS as vendas em hold dele agora.
router.get('/advance/preview', (req, res) => {
  const adv = require('../config/advance-fee');
  if (!adv.ENABLED) return res.json({ enabled: false });
  const now = Math.floor(Date.now() / 1000);
  const gFilter = req.guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const gArgs = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`
    SELECT s.id, COALESCE(NULLIF(s.net_to_owner_cents,0), s.amount_cents) AS net
    FROM sales s
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role = 'owner'
    WHERE ug.user_id = ?
      AND s.status = 'paid'
      AND s.available_at IS NOT NULL
      AND s.available_at > ?
      AND s.advance_request_id IS NULL
      ${gFilter}
  `).all(req.appUser.id, now, ...gArgs);

  const gross = rows.reduce((acc, r) => acc + (r.net || 0), 0);
  const fee = adv.calcFee(gross);
  const net = gross - fee;
  res.json({
    enabled: true,
    rate: adv.RATE_DEFAULT,
    min_gross_cents: adv.MIN_GROSS,
    sales_count: rows.length,
    gross_cents: gross,
    fee_cents: fee,
    net_cents: net,
    eligible: gross >= adv.MIN_GROSS
  });
});

// Executa antecipacao: marca sales como advanced + cria advance_request +
// "libera" o net antecipado (setando available_at <= now nas sales).
router.post('/advance/execute', (req, res) => {
  const adv = require('../config/advance-fee');
  if (!adv.ENABLED) return res.status(503).json({ error: 'antecipacao desabilitada' });

  const now = Math.floor(Date.now() / 1000);
  const gFilter = req.guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const gArgs = req.guildId ? [req.guildId] : [];
  const eligible = db.prepare(`
    SELECT s.id, COALESCE(NULLIF(s.net_to_owner_cents,0), s.amount_cents) AS net
    FROM sales s
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role = 'owner'
    WHERE ug.user_id = ?
      AND s.status = 'paid'
      AND s.available_at IS NOT NULL
      AND s.available_at > ?
      AND s.advance_request_id IS NULL
      ${gFilter}
  `).all(req.appUser.id, now, ...gArgs);

  const gross = eligible.reduce((a, r) => a + (r.net || 0), 0);
  if (gross < adv.MIN_GROSS) {
    return res.status(400).json({ error: `valor minimo de antecipacao: R$ ${(adv.MIN_GROSS / 100).toFixed(2)}`, gross_cents: gross });
  }

  const fee = adv.calcFee(gross);
  const net = gross - fee;

  // Transacao atomica
  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO advance_requests (user_id, guild_id, gross_cents, fee_rate, fee_cents, net_cents, status, sale_ids)
      VALUES (?,?,?,?,?,?,'applied',?)
    `).run(
      req.appUser.id,
      req.guildId || null,
      gross,
      adv.RATE_DEFAULT,
      fee,
      net,
      JSON.stringify(eligible.map(r => r.id))
    );
    const adId = info.lastInsertRowid;
    // Marca as sales: zera o hold (available_at <= now) e linka o advance
    const stmt = db.prepare(`UPDATE sales SET available_at = ?, advance_request_id = ?, advanced_at = ? WHERE id = ?`);
    for (const r of eligible) stmt.run(now, adId, now, r.id);
    return adId;
  });

  const adId = tx();
  audit.log({ req, action: 'wallet.advance', target_type: 'advance_request', target_id: adId, details: { gross_cents: gross, fee_cents: fee, net_cents: net, sales: eligible.length } });

  res.json({
    ok: true,
    advance_id: adId,
    gross_cents: gross,
    fee_cents: fee,
    net_cents: net,
    rate: adv.RATE_DEFAULT,
    sales_advanced: eligible.length
  });
});

// Toggle de saque automatico (so vendedor 'established' pode habilitar)
router.get('/auto-withdraw', (req, res) => {
  const u = db.prepare('SELECT auto_withdraw_enabled, auto_withdraw_min_cents FROM users WHERE id=?').get(req.appUser.id);
  const hp = require('../config/hold-period');
  const tier = hp.classifySeller(db, req.appUser.id);
  res.json({
    enabled: !!u?.auto_withdraw_enabled,
    min_cents: u?.auto_withdraw_min_cents || 5000,
    tier,
    eligible: tier === 'established'
  });
});

router.post('/auto-withdraw', (req, res) => {
  const { enabled, min_cents } = req.body || {};
  const hp = require('../config/hold-period');
  const tier = hp.classifySeller(db, req.appUser.id);
  if (enabled && tier !== 'established') {
    return res.status(403).json({ error: 'apenas vendedores estabelecidos podem habilitar saque automatico', tier });
  }
  const min = Math.max(5000, parseInt(min_cents) || 5000);
  db.prepare(`UPDATE users SET auto_withdraw_enabled=?, auto_withdraw_min_cents=? WHERE id=?`)
    .run(enabled ? 1 : 0, min, req.appUser.id);
  res.json({ ok: true, enabled: !!enabled, min_cents: min });
});

// Historico de antecipacoes do vendedor
router.get('/advances', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM advance_requests WHERE user_id=?
    ORDER BY created_at DESC LIMIT 50
  `).all(req.appUser.id);
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

// Receita total da plataforma — % + taxa fixa + antecipacao
router.get('/admin/platform-revenue', requireOwner, (req, res) => {
  const percent = db.prepare(`SELECT COALESCE(SUM(platform_fee_cents),0) AS v FROM sales WHERE status='paid'`).get().v;
  const fixed = db.prepare(`SELECT COALESCE(SUM(COALESCE(platform_fixed_fee_cents,0)),0) AS v FROM sales WHERE status='paid'`).get().v;
  const advance = db.prepare(`SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE status='applied'`).get().v;
  let featured = 0;
  try { featured = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE paid_via='balance' AND status!='cancelled'`).get().v; } catch {}
  let badges = 0;
  try { badges = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments WHERE paid_via='balance'`).get().v; } catch {}
  const sales = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status='paid' AND (platform_fee_cents > 0 OR COALESCE(platform_fixed_fee_cents,0) > 0)`).get().c;
  const gross = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid'`).get().v;
  const now = Math.floor(Date.now()/1000);
  const monthStart = now - 30 * 86400;
  const monthPercent = db.prepare(`SELECT COALESCE(SUM(platform_fee_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(monthStart).v;
  const monthFixed = db.prepare(`SELECT COALESCE(SUM(COALESCE(platform_fixed_fee_cents,0)),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?`).get(monthStart).v;
  const monthAdvance = db.prepare(`SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE status='applied' AND created_at >= ?`).get(monthStart).v;
  let monthFeatured = 0;
  try { monthFeatured = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE paid_via='balance' AND status!='cancelled' AND created_at >= ?`).get(monthStart).v; } catch {}
  let monthBadges = 0;
  try { monthBadges = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments WHERE paid_via='balance' AND created_at >= ?`).get(monthStart).v; } catch {}
  const pf = require('../config/platform-fee');
  res.json({
    total_collected_cents: percent + fixed + advance + featured + badges,
    percent_collected_cents: percent,
    fixed_collected_cents: fixed,
    advance_collected_cents: advance,
    featured_collected_cents: featured,
    badge_collected_cents: badges,
    sales_with_fee: sales,
    gross_volume_cents: gross,
    month_collected_cents: monthPercent + monthFixed + monthAdvance + monthFeatured + monthBadges,
    month_percent_cents: monthPercent,
    month_fixed_cents: monthFixed,
    month_advance_cents: monthAdvance,
    month_featured_cents: monthFeatured,
    month_badge_cents: monthBadges,
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
