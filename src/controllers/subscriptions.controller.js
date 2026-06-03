// Assinaturas recorrentes do cliente final (comprador da loja).
const express = require('express');
const { db, getCredential } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

function stripe() {
  const key = getCredential('STRIPE_SECRET_KEY');
  if (!key) return null;
  return require('stripe')(key);
}

// GET list (owner) — assinaturas ativas dos clientes da guild
router.get('/', requireAuth, (req, res) => {
  const where = req.guildId ? 'WHERE (cs.guild_id=? OR cs.guild_id IS NULL)' : '';
  const args = req.guildId ? [req.guildId] : [];
  const rows = db.prepare(`
    SELECT cs.*, p.name AS product_name
    FROM customer_subscriptions cs
    LEFT JOIN products p ON p.id = cs.product_id
    ${where}
    ORDER BY cs.created_at DESC
    LIMIT 200
  `).all(...args);
  res.json(rows);
});

// POST checkout-subscription — cria sessao Stripe pra assinar produto
router.post('/checkout', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'Stripe nao configurado' });

  const { product_id, discord_id, discord_tag } = req.body || {};
  if (!product_id || !discord_id) return res.status(400).json({ error: 'product_id e discord_id obrigatorios' });

  const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(product_id);
  if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
  if (!product.is_subscription) return res.status(400).json({ error: 'produto nao e assinatura' });

  // Cria price recorrente em Stripe se ainda nao existir
  let priceId = product.stripe_price_id;
  if (!priceId) {
    try {
      const price = await s.prices.create({
        currency: 'brl',
        unit_amount: product.price_cents,
        recurring: { interval: product.subscription_interval === 'year' ? 'year' : 'month' },
        product_data: { name: product.name }
      });
      priceId = price.id;
      db.prepare('UPDATE products SET stripe_price_id=? WHERE id=?').run(priceId, product.id);
    } catch (e) {
      return res.status(500).json({ error: 'falha criando price: ' + e.message });
    }
  }

  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${publicUrl}/loja.html?sub=ok`,
      cancel_url: `${publicUrl}/loja.html?sub=cancel`,
      metadata: {
        product_id: String(product.id),
        discord_id: String(discord_id),
        discord_tag: String(discord_tag || ''),
        guild_id: String(product.guild_id || ''),
        kind: 'customer_subscription'
      }
    });
    res.json({ ok: true, url: session.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST cancel — cancela no fim do periodo
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'Stripe nao configurado' });
  const sub = db.prepare('SELECT * FROM customer_subscriptions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'nao encontrado' });
  if (!sub.stripe_subscription_id) return res.status(400).json({ error: 'sem stripe sub id' });
  try {
    await s.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    db.prepare(`UPDATE customer_subscriptions SET cancel_at_period_end=1 WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
