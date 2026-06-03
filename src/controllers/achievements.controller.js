const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const svc = require('../services/achievements.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(svc.listFor(req.appUser.id, req.guildId));
});

router.get('/recheck', (req, res) => {
  // forca recalculo (sem precisar de venda nova)
  const { db } = require('../database/connection');
  const lastSale = db.prepare(`SELECT * FROM sales WHERE status='paid' ${req.guildId ? "AND (guild_id=? OR guild_id IS NULL)" : ''} ORDER BY paid_at DESC LIMIT 1`)
    .get(...(req.guildId ? [req.guildId] : []));
  if (lastSale) svc.checkAfterSale(lastSale);
  res.json(svc.listFor(req.appUser.id, req.guildId));
});

module.exports = router;
