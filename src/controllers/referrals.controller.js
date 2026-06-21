// Endpoints do programa de indicacao da plataforma (camada B)

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const refs = require('../services/referrals.service');

const router = express.Router();

// Pega/cria o codigo do user logado + estatisticas
router.get('/mine', requireAuth, (req, res) => {
  const code = refs.getOrCreateCode(db, req.appUser.id);
  const stats = refs.statsForReferrer(db, req.appUser.id);
  res.json({
    ...stats,
    code,
    share_url: (process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : '') + `/register.html?ref=${encodeURIComponent(code)}`,
    rev_share_pct: refs.DEFAULT_REV_SHARE,
    duration_days: refs.DURATION_DAYS,
    payout_mode: refs.PAYOUT_MODE
  });
});

// Valida um codigo (pra registro mostrar "voce esta sendo indicado por X")
router.get('/code/:code', (req, res) => {
  const row = refs.validateCode(db, req.params.code);
  if (!row) return res.status(404).json({ valid: false });
  const referrer = db.prepare('SELECT display_name, discord_tag FROM users WHERE id=?').get(row.user_id);
  res.json({
    valid: true,
    referrer_name: referrer?.display_name || referrer?.discord_tag || 'um vendedor BotDash',
    rev_share_pct: refs.DEFAULT_REV_SHARE
  });
});

// Linkagem manual (pra usuarios que ja existem e querem ser indicados via codigo)
router.post('/link', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code obrigatorio' });
  const id = refs.linkReferee(db, req.appUser.id, code);
  if (!id) return res.status(400).json({ error: 'codigo invalido ou voce ja foi indicado' });
  res.json({ ok: true, relationship_id: id });
});

module.exports = router;
