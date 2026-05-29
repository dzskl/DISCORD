const express = require('express');
const { db, logEvent } = require('../db');
const bot = require('../bot');

const router = express.Router();

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

router.get('/products', (req, res) => {
  const rows = db.prepare(`SELECT id,name,description,price_cents,duration FROM products WHERE active=1 ORDER BY price_cents ASC`).all();
  res.json(rows);
});

router.post('/create-session', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'Stripe nao configurado' });

  const { product_id, discord_id, discord_tag, coupon_code } = req.body || {};
  if (!product_id || !discord_id) return res.status(400).json({ error: 'product_id e discord_id obrigatorios' });

  const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(product_id);
  if (!product) return res.status(404).json({ error: 'produto nao encontrado' });

  let coupon = null;
  let unit_amount = product.price_cents;
  if (coupon_code) {
    coupon = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(coupon_code.trim().toUpperCase());
    if (!coupon) return res.status(400).json({ error: 'cupom invalido' });
    if (coupon.expires_at && coupon.expires_at < Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'cupom expirado' });
    if (coupon.max_uses != null && coupon.uses >= coupon.max_uses) return res.status(400).json({ error: 'cupom esgotado' });
    unit_amount = Math.max(50, Math.round(unit_amount * (100 - coupon.discount_percent) / 100));
  }

  const currency = (process.env.STRIPE_CURRENCY || 'brl').toLowerCase();
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';

  try {
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount,
          product_data: {
            name: product.name + (coupon ? ` (-${coupon.discount_percent}%)` : ''),
            description: product.description || undefined
          }
        }
      }],
      success_url: `${publicUrl}/loja.html?status=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/loja.html?status=cancel`,
      metadata: {
        product_id: String(product.id),
        discord_id: String(discord_id),
        discord_tag: String(discord_tag || ''),
        coupon_id: coupon ? String(coupon.id) : ''
      }
    });

    db.prepare(`
      INSERT INTO sales (product_id,discord_id,discord_tag,amount_cents,status,stripe_session_id)
      VALUES (?,?,?,?, 'pending', ?)
    `).run(product.id, discord_id, discord_tag || null, unit_amount, session.id);

    res.json({ url: session.url, session_id: session.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).send('Stripe nao configurado');

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = secret
      ? s.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata || {};
    const sale = db.prepare('SELECT * FROM sales WHERE stripe_session_id=?').get(session.id);
    if (sale && sale.status !== 'paid') {
      const product = db.prepare('SELECT * FROM products WHERE id=?').get(sale.product_id);
      const expiresAt = computeExpiry(product?.duration);

      db.prepare(`
        UPDATE sales SET status='paid', paid_at=strftime('%s','now'),
        stripe_payment_intent=?, expires_at=? WHERE id=?
      `).run(session.payment_intent || null, expiresAt, sale.id);

      if (meta.coupon_id) {
        db.prepare('UPDATE coupons SET uses=uses+1 WHERE id=?').run(parseInt(meta.coupon_id));
      }

      if (product?.role_id) {
        try {
          const tag = await bot.grantRole(meta.discord_id || sale.discord_id, product.role_id);
          db.prepare('UPDATE sales SET role_granted=1, discord_tag=COALESCE(discord_tag,?) WHERE id=?').run(tag, sale.id);
          logEvent({
            type: 'venda',
            message: `Venda R$${(sale.amount_cents / 100).toFixed(2).replace('.', ',')} — ${product.name}`,
            discord_id: sale.discord_id,
            discord_tag: tag
          });
          await bot.notifySaleChannel(`🛒 Nova venda: **${product.name}** — <@${sale.discord_id}>`);
        } catch (e) {
          console.error('[CHECKOUT] erro ao dar cargo:', e.message);
          logEvent({ type: 'erro', message: `Falha ao dar cargo: ${e.message}`, discord_id: sale.discord_id });
        }
      } else {
        logEvent({
          type: 'venda',
          message: `Venda R$${(sale.amount_cents / 100).toFixed(2).replace('.', ',')} — ${product?.name || 'produto'}`,
          discord_id: sale.discord_id
        });
      }
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const pi = charge.payment_intent;
    const sale = db.prepare('SELECT * FROM sales WHERE stripe_payment_intent=?').get(pi);
    if (sale) {
      db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
      const product = db.prepare('SELECT * FROM products WHERE id=?').get(sale.product_id);
      if (product?.role_id) await bot.revokeRole(sale.discord_id, product.role_id).catch(() => {});
      logEvent({ type: 'reembolso', message: `Reembolso aplicado — ${product?.name || ''}`, discord_id: sale.discord_id });
    }
  }

  res.json({ received: true });
});

function computeExpiry(duration) {
  if (!duration || duration === 'permanent') return null;
  const now = Math.floor(Date.now() / 1000);
  const map = { '1d': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '1y': 365 * 86400 };
  return now + (map[duration] || 0);
}

module.exports = router;
