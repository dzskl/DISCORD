const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const where = req.guildId ? 'WHERE (guild_id = ? OR guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  res.json(db.prepare(`SELECT * FROM coupons ${where} ORDER BY active DESC, created_at DESC`).all(...args));
});

router.post('/', requireAuth, (req, res) => {
  const { code, discount_percent, max_uses, expires_at, min_amount, required_role_id, min_quantity, max_quantity } = req.body || {};
  if (!code || !discount_percent) return res.status(400).json({ error: 'code e discount_percent obrigatorios' });
  const pct = parseInt(discount_percent);
  if (!(pct > 0 && pct <= 100)) return res.status(400).json({ error: 'desconto deve ser 1-100' });
  const min_cents = min_amount ? Math.round(parseFloat(min_amount) * 100) : null;

  try {
    const info = db.prepare(`
      INSERT INTO coupons (code,discount_percent,max_uses,expires_at,min_amount_cents,required_role_id,min_quantity,max_quantity,guild_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      code.trim().toUpperCase(), pct,
      max_uses ? parseInt(max_uses) : null,
      expires_at || null,
      min_cents,
      required_role_id || null,
      min_quantity ? parseInt(min_quantity) : null,
      max_quantity ? parseInt(max_quantity) : null,
      req.guildId || null
    );
    res.json(db.prepare('SELECT * FROM coupons WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'codigo ja existe' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE coupons SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/validate', async (req, res) => {
  const { code, cart_total_cents, cart_quantity, discord_id } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code obrigatorio' });
  const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(code.trim().toUpperCase());
  if (!c) return res.status(404).json({ error: 'cupom invalido' });
  if (c.expires_at && c.expires_at < Math.floor(Date.now() / 1000)) return res.status(410).json({ error: 'cupom expirado' });
  if (c.max_uses != null && c.uses >= c.max_uses) return res.status(410).json({ error: 'cupom esgotado' });
  if (c.min_amount_cents && cart_total_cents != null && cart_total_cents < c.min_amount_cents) {
    return res.status(400).json({ error: `valor minimo de R$ ${(c.min_amount_cents / 100).toFixed(2).replace('.', ',')}` });
  }
  if (c.min_quantity && cart_quantity != null && cart_quantity < c.min_quantity) {
    return res.status(400).json({ error: `cupom exige no minimo ${c.min_quantity} item(s) no carrinho` });
  }
  if (c.max_quantity && cart_quantity != null && cart_quantity > c.max_quantity) {
    return res.status(400).json({ error: `cupom limita carrinho a ${c.max_quantity} item(s)` });
  }
  if (c.required_role_id && discord_id) {
    try {
      const bot = require('../services/bot.service');
      const guild = await bot.fetchGuild();
      const member = await guild.members.fetch(discord_id).catch(() => null);
      if (!member || !member.roles.cache.has(c.required_role_id)) {
        return res.status(403).json({ error: 'cupom restrito a um cargo especifico' });
      }
    } catch {}
  }
  res.json({ ok: true, discount_percent: c.discount_percent, code: c.code, min_amount_cents: c.min_amount_cents, required_role_id: c.required_role_id });
});

module.exports = router;
