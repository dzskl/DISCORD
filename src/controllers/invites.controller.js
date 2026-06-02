const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM invites_log ORDER BY joined_at DESC LIMIT 200
  `).all();
  res.json(rows);
});

router.get('/leaderboard', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT inviter_id, MAX(inviter_tag) AS inviter_tag,
      COUNT(*) AS total_invites,
      SUM(CASE WHEN left_at IS NULL THEN 1 ELSE 0 END) AS active_invites,
      SUM(CASE WHEN left_at IS NOT NULL THEN 1 ELSE 0 END) AS lost_invites
    FROM invites_log
    WHERE inviter_id IS NOT NULL
    GROUP BY inviter_id ORDER BY total_invites DESC LIMIT 50
  `).all();
  res.json(rows);
});

module.exports = router;
