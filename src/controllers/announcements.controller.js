const express = require('express');
const { db, logEvent } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const bot = require('../services/bot.service');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, p.name AS product_name FROM announcements a
    LEFT JOIN products p ON p.id = a.product_id
    ORDER BY a.created_at DESC LIMIT 100
  `).all());
});

router.get('/scheduled', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT * FROM announcements WHERE status='scheduled' ORDER BY scheduled_for ASC`).all());
});

router.post('/', requireAuth, async (req, res) => {
  const { channels, body, kind, embed_title, embed_color, product_id, scheduled_for } = req.body || {};
  if (!Array.isArray(channels) || !channels.length) return res.status(400).json({ error: 'canais obrigatorios' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'mensagem obrigatoria' });

  const channelsStr = channels.join(',');
  const k = kind || 'texto';

  if (scheduled_for) {
    const info = db.prepare(`
      INSERT INTO announcements (channels,body,kind,embed_title,embed_color,product_id,scheduled_for,status)
      VALUES (?,?,?,?,?,?,?,'scheduled')
    `).run(channelsStr, body, k, embed_title || null, embed_color || null, product_id || null, parseInt(scheduled_for));
    return res.json({ ok: true, id: info.lastInsertRowid, status: 'scheduled' });
  }

  try {
    let productName = null, productPrice = null;
    if (product_id) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
      if (p) { productName = p.name; productPrice = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ','); }
    }

    const sent = await bot.sendAnnouncement({
      channels, body, kind: k, embed_title, embed_color, productName, productPrice
    });

    const info = db.prepare(`
      INSERT INTO announcements (channels,body,kind,embed_title,embed_color,product_id,sent_at,status)
      VALUES (?,?,?,?,?,?,strftime('%s','now'),'sent')
    `).run(channelsStr, body, k, embed_title || null, embed_color || null, product_id || null);

    logEvent({ type: 'anuncio', message: `Anuncio enviado em ${sent.join(', ')}`, channel: sent.join(',') });
    res.json({ ok: true, id: info.lastInsertRowid, sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM announcements WHERE id=? AND status='scheduled'`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
