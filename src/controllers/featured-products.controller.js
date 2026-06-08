// Destaque pago de produto na loja.
// Tiers:
//   - basic:   R$  9,90/semana — sobe na ordenacao
//   - premium: R$ 24,90/semana — destaque com selo
//   - top:     R$ 49,90/semana — topo absoluto + selo
// Pagamento sai do saldo do vendedor (uso "interno"). Se nao tiver saldo
// suficiente, retorna 402 e o vendedor pode pagar via PIX/Stripe separado.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();

const TIERS = {
  basic:   { price_cents:  990, days: 7,  label: 'Basico — 7 dias' },
  premium: { price_cents: 2490, days: 7,  label: 'Premium — 7 dias' },
  top:     { price_cents: 4990, days: 7,  label: 'Top — 7 dias' }
};

router.get('/tiers', (req, res) => {
  res.json(Object.entries(TIERS).map(([id, t]) => ({ id, ...t })));
});

// Lista featured ativos do vendedor logado
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, p.name AS product_name, p.image_url
    FROM featured_products f
    JOIN products p ON p.id = f.product_id
    WHERE f.user_id = ? AND f.status = 'active'
    ORDER BY f.ends_at DESC
  `).all(req.appUser.id);
  res.json(rows);
});

// Lista featured ativos pra exibicao publica na loja
router.get('/active', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const gFilter = req.query.guild_id ? 'AND f.guild_id = ?' : '';
  const args = req.query.guild_id ? [now, req.query.guild_id] : [now];
  const rows = db.prepare(`
    SELECT f.tier, f.ends_at, p.id AS product_id, p.name, p.price_cents, p.image_url, p.description
    FROM featured_products f
    JOIN products p ON p.id = f.product_id
    WHERE f.status='active' AND f.ends_at > ? AND p.active=1 ${gFilter}
    ORDER BY
      CASE f.tier WHEN 'top' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END,
      f.created_at DESC
    LIMIT 50
  `).all(...args);
  res.json(rows);
});

// Compra destaque (debita do saldo do vendedor)
router.post('/buy', requireAuth, (req, res) => {
  const { product_id, tier } = req.body || {};
  if (!product_id || !TIERS[tier]) {
    return res.status(400).json({ error: 'product_id e tier (basic|premium|top) obrigatorios' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
  if (!product) return res.status(404).json({ error: 'produto nao encontrado' });

  // Verifica que o vendedor logado eh dono do guild do produto
  if (product.guild_id) {
    const own = db.prepare(`SELECT 1 FROM user_guilds WHERE user_id=? AND guild_id=? AND role='owner'`)
      .get(req.appUser.id, product.guild_id);
    if (!own) return res.status(403).json({ error: 'voce nao eh dono desse produto' });
  }

  const t = TIERS[tier];
  // Checa saldo disponivel
  const walletCtrl = require('./wallet.controller');
  // Reuso simplificado: chama a logica interna replicada
  const now = Math.floor(Date.now() / 1000);
  // Calcula available_cents (sem importar a funcao por dependencia circular)
  const released = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(NULLIF(s.net_to_owner_cents, 0), s.amount_cents) - COALESCE(p.cost_cents,0)),0) AS v
    FROM sales s LEFT JOIN products p ON p.id=s.product_id
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
    WHERE ug.user_id=? AND s.status='paid' AND (s.available_at IS NULL OR s.available_at <= ?)
  `).get(req.appUser.id, now).v;
  const withdrawn = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM withdrawals WHERE user_id=? AND status IN ('pending','approved','paid')`).get(req.appUser.id).v;
  const advFees = db.prepare(`SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE user_id=? AND status='applied'`).get(req.appUser.id).v;
  const featSpent = db.prepare(`SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE user_id=? AND paid_via='balance' AND status!='cancelled'`).get(req.appUser.id).v;
  const available = released - withdrawn - advFees - featSpent;

  if (available < t.price_cents) {
    return res.status(402).json({ error: 'saldo insuficiente', available_cents: available, needed_cents: t.price_cents });
  }

  // Verifica overlap: se ja tem featured ativo do mesmo produto, estende
  const existing = db.prepare(`SELECT * FROM featured_products WHERE product_id=? AND status='active' AND ends_at>?`).get(product_id, now);

  const startsAt = existing ? existing.ends_at : now;
  const endsAt = startsAt + t.days * 86400;

  const info = db.prepare(`
    INSERT INTO featured_products (product_id, user_id, guild_id, tier, price_cents, days, starts_at, ends_at, paid_via)
    VALUES (?,?,?,?,?,?,?,?,'balance')
  `).run(product_id, req.appUser.id, product.guild_id || null, tier, t.price_cents, t.days, startsAt, endsAt);

  // Atualiza flag rapida no products (pega o tier mais alto + ends_at mais futuro)
  db.prepare(`
    UPDATE products SET featured_until = ?, featured_tier = ?
    WHERE id = ? AND (featured_until IS NULL OR featured_until < ?)
  `).run(endsAt, tier, product_id, endsAt);

  audit.log({ req, action: 'featured.buy', target_type: 'product', target_id: product_id, details: { tier, price_cents: t.price_cents, days: t.days } });

  res.json({ ok: true, id: info.lastInsertRowid, ends_at: endsAt, tier });
});

module.exports = router;
