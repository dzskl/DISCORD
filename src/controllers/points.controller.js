// Endpoints pro vendedor consultar seus BotDash Points e historico

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const points = require('../services/points.service');

const router = express.Router();
router.use(requireAuth);

router.get('/balance', (req, res) => {
  const bal = points.getBalance(db, req.appUser.id);
  res.json({
    balance_points: bal.balance_points || 0,
    balance_brl: ((bal.balance_points || 0) / 100).toFixed(2),
    lifetime_earned: bal.lifetime_earned || 0,
    lifetime_spent: bal.lifetime_spent || 0,
    tier: bal.tier || 'bronze',
    next_tier: nextTier(bal.tier),
    next_tier_at: nextTierThreshold(bal.tier),
    progress_pct: progressPct(bal.lifetime_earned || 0, bal.tier)
  });
});

router.get('/ledger', (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit) || 100);
  res.json(points.ledger(db, req.appUser.id, limit));
});

function nextTier(tier) {
  const map = { bronze: 'prata', prata: 'ouro', ouro: 'diamante', diamante: null };
  return map[tier] || null;
}
function nextTierThreshold(tier) {
  return { bronze: 5000, prata: 30000, ouro: 100000, diamante: null }[tier];
}
function progressPct(lifetime, tier) {
  const t = nextTierThreshold(tier);
  if (!t) return 100;
  return Math.min(100, Math.round((lifetime / t) * 100));
}

module.exports = router;
