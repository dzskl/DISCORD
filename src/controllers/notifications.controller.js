const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE user_id=?
    ORDER BY created_at DESC LIMIT 30
  `).all(req.appUser.id);
  const unread = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND read_at IS NULL`).get(req.appUser.id).c;
  res.json({ items: rows, unread });
});

router.post('/:id/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at=strftime('%s','now') WHERE id=? AND user_id=? AND read_at IS NULL`)
    .run(req.params.id, req.appUser.id);
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at=strftime('%s','now') WHERE user_id=? AND read_at IS NULL`).run(req.appUser.id);
  res.json({ ok: true });
});

module.exports = router;
