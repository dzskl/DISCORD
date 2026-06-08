// Reviews de produto + vendedor. Lock-in: vendedor sai = perde reputacao.
//
// Fluxo:
//   1. Venda paga + D+7 → cron gera review_invite token + DM ao comprador
//   2. Comprador acessa /review/:token e da nota 1-5 + comentario
//   3. Review fica visivel na loja publica + Discord embed
//   4. Vendedor com >=10 reviews e media >=4.5 ganha selo "Top Seller"

const express = require('express');
const crypto = require('crypto');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// ---------- PUBLICO ----------
// Lista reviews de um produto
router.get('/product/:id', (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const rows = db.prepare(`
    SELECT id, rating, comment, buyer_discord_tag, helpful_count, created_at
    FROM reviews
    WHERE product_id=? AND status='visible'
    ORDER BY created_at DESC LIMIT ?
  `).all(req.params.id, limit);
  const agg = db.prepare(`
    SELECT COUNT(*) AS total, AVG(rating) AS avg
    FROM reviews WHERE product_id=? AND status='visible'
  `).get(req.params.id);
  res.json({
    total: agg.total || 0,
    avg: agg.avg ? Number(agg.avg.toFixed(2)) : null,
    items: rows
  });
});

// Lista reviews de um vendedor (por user_id)
router.get('/seller/:userId', (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const rows = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.buyer_discord_tag, r.created_at, p.name AS product_name
    FROM reviews r LEFT JOIN products p ON p.id = r.product_id
    WHERE r.seller_user_id=? AND r.status='visible'
    ORDER BY r.created_at DESC LIMIT ?
  `).all(req.params.userId, limit);
  const agg = db.prepare(`
    SELECT COUNT(*) AS total, AVG(rating) AS avg
    FROM reviews WHERE seller_user_id=? AND status='visible'
  `).get(req.params.userId);
  const isTopSeller = (agg.total || 0) >= 10 && (agg.avg || 0) >= 4.5;
  res.json({ total: agg.total || 0, avg: agg.avg ? Number(agg.avg.toFixed(2)) : null, top_seller: isTopSeller, items: rows });
});

// Detalhe de uma invitation (publico, antes de submeter)
router.get('/invite/:token', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const inv = db.prepare(`SELECT * FROM review_invites WHERE token=? AND used=0 AND expires_at > ?`).get(req.params.token, now);
  if (!inv) return res.status(404).json({ error: 'convite invalido ou expirado' });
  const sale = db.prepare(`
    SELECT s.id, s.discord_id, s.discord_tag, s.amount_cents, s.product_id, p.name AS product_name, p.image_url
    FROM sales s LEFT JOIN products p ON p.id = s.product_id WHERE s.id=?
  `).get(inv.sale_id);
  res.json({ invite_token: inv.token, sale });
});

// Submete review
router.post('/invite/:token', (req, res) => {
  const { rating, comment } = req.body || {};
  const r = parseInt(rating);
  if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'rating deve ser 1-5' });
  const now = Math.floor(Date.now() / 1000);
  const inv = db.prepare(`SELECT * FROM review_invites WHERE token=? AND used=0 AND expires_at > ?`).get(req.params.token, now);
  if (!inv) return res.status(404).json({ error: 'convite invalido ou expirado' });
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(inv.sale_id);
  if (!sale) return res.status(404).json({ error: 'venda nao encontrada' });

  // Descobre vendedor
  const { findSellerUserId } = require('../utils/seller-resolver');
  const sellerId = findSellerUserId(db, sale);

  const existing = db.prepare('SELECT id FROM reviews WHERE sale_id=?').get(sale.id);
  if (existing) return res.status(409).json({ error: 'review ja existe pra essa venda' });

  db.prepare(`
    INSERT INTO reviews (sale_id, product_id, guild_id, seller_user_id, buyer_discord_id, buyer_discord_tag, rating, comment)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(sale.id, sale.product_id, sale.guild_id || null, sellerId, sale.discord_id, sale.discord_tag, r, String(comment || '').slice(0, 1000));
  db.prepare(`UPDATE review_invites SET used=1 WHERE id=?`).run(inv.id);
  res.json({ ok: true });
});

// ---------- VENDEDOR ----------
// Reviews recebidos pelo vendedor logado
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, p.name AS product_name FROM reviews r
    LEFT JOIN products p ON p.id = r.product_id
    WHERE r.seller_user_id=? ORDER BY r.created_at DESC LIMIT 200
  `).all(req.appUser.id);
  const agg = db.prepare(`
    SELECT COUNT(*) AS total, AVG(rating) AS avg,
      SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) AS r5,
      SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) AS r4,
      SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) AS r3,
      SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) AS r2,
      SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) AS r1
    FROM reviews WHERE seller_user_id=? AND status='visible'
  `).get(req.appUser.id);
  res.json({
    total: agg.total || 0,
    avg: agg.avg ? Number(agg.avg.toFixed(2)) : null,
    distribution: { r5: agg.r5 || 0, r4: agg.r4 || 0, r3: agg.r3 || 0, r2: agg.r2 || 0, r1: agg.r1 || 0 },
    top_seller: (agg.total || 0) >= 10 && (agg.avg || 0) >= 4.5,
    items: rows
  });
});

// Reporta review abusivo
router.post('/:id/report', requireAuth, (req, res) => {
  const { reason } = req.body || {};
  const rev = db.prepare('SELECT * FROM reviews WHERE id=? AND seller_user_id=?').get(req.params.id, req.appUser.id);
  if (!rev) return res.status(404).json({ error: 'review nao encontrado ou nao eh seu' });
  db.prepare(`UPDATE reviews SET status='reported', hidden_reason=? WHERE id=?`).run(String(reason || '').slice(0, 200), rev.id);
  res.json({ ok: true });
});

// ---------- HELPER (gera convite, chamado por cron) ----------
function generateInviteForSale(db, saleId, expiresInDays = 30) {
  const token = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO review_invites (sale_id, token, expires_at) VALUES (?, ?, ?)`)
    .run(saleId, token, now + expiresInDays * 86400);
  return token;
}

router._generateInviteForSale = generateInviteForSale;
module.exports = router;
