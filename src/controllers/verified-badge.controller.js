// Selo "Verificado" pago — R$ 19,90/mes.
// Vitrine mostra o selo. Receita recorrente, baixissimo custo operacional.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();

const PRICE_MONTHLY_CENTS = parseInt(process.env.VERIFIED_BADGE_PRICE_CENTS) || 1990;
const PRICE_YEARLY_CENTS  = parseInt(process.env.VERIFIED_BADGE_YEARLY_CENTS) || 19900; // ~16,5/mes
const VALID_PLANS = ['monthly', 'yearly'];

router.get('/pricing', (req, res) => {
  res.json({
    monthly_cents: PRICE_MONTHLY_CENTS,
    yearly_cents: PRICE_YEARLY_CENTS,
    yearly_savings_cents: 12 * PRICE_MONTHLY_CENTS - PRICE_YEARLY_CENTS
  });
});

router.get('/status', requireAuth, (req, res) => {
  const u = db.prepare(`SELECT verified_badge_until, verified_badge_started_at FROM users WHERE id=?`).get(req.appUser.id);
  const now = Math.floor(Date.now() / 1000);
  const active = !!(u?.verified_badge_until && u.verified_badge_until > now);
  res.json({
    active,
    expires_at: u?.verified_badge_until || null,
    started_at: u?.verified_badge_started_at || null,
    expires_in_days: active ? Math.ceil((u.verified_badge_until - now) / 86400) : 0
  });
});

// Renova/contrata pagando com saldo
router.post('/buy', requireAuth, (req, res) => {
  const { plan } = req.body || {};
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'plan deve ser monthly|yearly' });

  const price = plan === 'yearly' ? PRICE_YEARLY_CENTS : PRICE_MONTHLY_CENTS;
  const months = plan === 'yearly' ? 12 : 1;

  // Calcula saldo disponivel (replica balanceFor pra evitar dep circular)
  const now = Math.floor(Date.now() / 1000);
  const released = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(NULLIF(s.net_to_owner_cents,0), s.amount_cents) - COALESCE(p.cost_cents,0)),0) AS v
    FROM sales s LEFT JOIN products p ON p.id=s.product_id
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
    WHERE ug.user_id=? AND s.status='paid' AND (s.available_at IS NULL OR s.available_at <= ?)
  `).get(req.appUser.id, now).v;
  const withdrawn = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status IN ('pending','approved','paid')`).get(req.appUser.id).v;
  const advFees = db.prepare(`SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE user_id=? AND status='applied'`).get(req.appUser.id).v;
  let featSpent = 0;
  try { featSpent = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE user_id=? AND paid_via='balance' AND status!='cancelled'`).get(req.appUser.id).v; } catch {}
  let badgeSpent = 0;
  try { badgeSpent = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments WHERE user_id=? AND paid_via='balance'`).get(req.appUser.id).v; } catch {}
  const available = released - withdrawn - advFees - featSpent - badgeSpent;

  if (available < price) {
    return res.status(402).json({ error: 'saldo insuficiente', available_cents: available, needed_cents: price });
  }

  const u = db.prepare(`SELECT verified_badge_until FROM users WHERE id=?`).get(req.appUser.id);
  const startsAt = u?.verified_badge_until && u.verified_badge_until > now ? u.verified_badge_until : now;
  const endsAt = startsAt + months * 30 * 86400;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO verified_badge_payments (user_id, price_cents, months, starts_at, ends_at, paid_via)
      VALUES (?,?,?,?,?,'balance')
    `).run(req.appUser.id, price, months, startsAt, endsAt);
    db.prepare(`UPDATE users SET verified_badge_until=?, verified_badge_started_at=COALESCE(verified_badge_started_at,?) WHERE id=?`)
      .run(endsAt, now, req.appUser.id);
  });
  tx();

  audit.log({ req, action: 'badge.buy', target_id: req.appUser.id, details: { plan, price_cents: price, months } });
  res.json({ ok: true, expires_at: endsAt, months });
});

module.exports = router;
