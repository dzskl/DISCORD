const express = require('express');
const { db, logEvent, getConfig } = require('../db');
const bot = require('../bot');

const router = express.Router();

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

router.get('/products', (req, res) => {
  const rows = db.prepare(`
    SELECT id,name,description,price_cents,duration,image_url,stock,accent_color
    FROM products WHERE active=1 ORDER BY price_cents ASC
  `).all();
  res.json(rows);
});

router.post('/create-session', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'Stripe nao configurado' });

  let { product_id, items, discord_id, discord_tag, coupon_code } = req.body || {};
  if (!discord_id) return res.status(400).json({ error: 'discord_id obrigatorio' });

  // Compat: aceita ou items[] (carrinho) ou product_id (compra unica)
  if (!Array.isArray(items) || !items.length) {
    if (!product_id) return res.status(400).json({ error: 'items ou product_id obrigatorio' });
    items = [{ product_id: parseInt(product_id), quantity: 1 }];
  }

  // Carregar produtos e validar estoque
  const cartProducts = [];
  for (const it of items) {
    const qty = Math.max(1, parseInt(it.quantity) || 1);
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.product_id);
    if (!p) return res.status(404).json({ error: `produto ${it.product_id} nao encontrado` });
    if (p.stock != null && p.stock < qty) return res.status(400).json({ error: `${p.name} sem estoque suficiente (${p.stock} disponivel)` });
    cartProducts.push({ product: p, quantity: qty });
  }

  // Total bruto
  let subtotal = cartProducts.reduce((s, x) => s + x.product.price_cents * x.quantity, 0);

  // Cupom
  let coupon = null;
  let discount_cents = 0;
  if (coupon_code) {
    coupon = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(coupon_code.trim().toUpperCase());
    if (!coupon) return res.status(400).json({ error: 'cupom invalido' });
    if (coupon.expires_at && coupon.expires_at < Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'cupom expirado' });
    if (coupon.max_uses != null && coupon.uses >= coupon.max_uses) return res.status(400).json({ error: 'cupom esgotado' });
    if (coupon.min_amount_cents && subtotal < coupon.min_amount_cents) return res.status(400).json({ error: `cupom exige valor minimo de R$ ${(coupon.min_amount_cents / 100).toFixed(2).replace('.', ',')}` });
    discount_cents = Math.round(subtotal * coupon.discount_percent / 100);
  }

  const total_before_fee = Math.max(50, subtotal - discount_cents);

  // Repassar taxa Stripe?
  const cfg = getConfig();
  let total = total_before_fee;
  let fee_cents = 0;
  if (cfg.pass_fees_to_customer === '1') {
    const pct = parseFloat(cfg.fee_percent || '4') / 100;
    const fixed = parseInt(cfg.fee_fixed_cents || '39');
    // Adiciona taxa em cima do total: total / (1-pct) + fixed - cobre a taxa Stripe
    fee_cents = Math.round(total_before_fee * pct / (1 - pct)) + fixed;
    total = total_before_fee + fee_cents;
  }

  const currency = (process.env.STRIPE_CURRENCY || 'brl').toLowerCase();
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const methods = (process.env.STRIPE_PAYMENT_METHODS || 'card,pix').split(',').map(m => m.trim()).filter(Boolean);

  // Distribui desconto proporcionalmente nos line_items
  const line_items = cartProducts.map(({ product, quantity }) => {
    const baseUnit = product.price_cents;
    const discountedUnit = coupon ? Math.round(baseUnit * (100 - coupon.discount_percent) / 100) : baseUnit;
    return {
      quantity,
      price_data: {
        currency,
        unit_amount: Math.max(50, discountedUnit),
        product_data: {
          name: product.name + (coupon ? ` (-${coupon.discount_percent}%)` : ''),
          description: product.description || undefined,
          images: product.image_url ? [product.image_url] : undefined
        }
      }
    };
  });

  if (fee_cents > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: fee_cents,
        product_data: { name: 'Taxa de processamento' }
      }
    });
  }

  try {
    const cart_meta = cartProducts.map(({ product, quantity }) => ({ id: product.id, q: quantity }));
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: methods,
      line_items,
      success_url: `${publicUrl}/loja.html?status=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/loja.html?status=cancel`,
      metadata: {
        cart: JSON.stringify(cart_meta).slice(0, 490),
        discord_id: String(discord_id),
        discord_tag: String(discord_tag || ''),
        coupon_id: coupon ? String(coupon.id) : ''
      }
    });

    db.prepare(`
      INSERT INTO sales (product_id,discord_id,discord_tag,amount_cents,status,stripe_session_id,cart_items)
      VALUES (?,?,?,?, 'pending', ?, ?)
    `).run(
      cartProducts[0].product.id,
      discord_id,
      discord_tag || null,
      total,
      session.id,
      JSON.stringify(cart_meta)
    );

    res.json({ url: session.url, session_id: session.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).send('Stripe nao configurado');

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    return res.status(503).send('STRIPE_WEBHOOK_SECRET obrigatorio em producao');
  }

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
      const cartItems = parseCart(sale.cart_items);
      const firstProduct = db.prepare('SELECT * FROM products WHERE id=?').get(sale.product_id);
      const expiresAt = computeExpiry(firstProduct?.duration);

      db.prepare(`
        UPDATE sales SET status='paid', paid_at=strftime('%s','now'),
        stripe_payment_intent=?, expires_at=? WHERE id=?
      `).run(session.payment_intent || null, expiresAt, sale.id);

      if (meta.coupon_id) db.prepare('UPDATE coupons SET uses=uses+1 WHERE id=?').run(parseInt(meta.coupon_id));

      const cfg = getConfig();
      const valueStr = `R$${(sale.amount_cents / 100).toFixed(2).replace('.', ',')}`;
      const tagsBought = [];

      // Decrementar estoque + dar cargos / abrir ticket de entrega manual
      let hasManualDelivery = false;
      for (const item of cartItems) {
        const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
        if (!p) continue;
        if (p.stock != null) {
          const newQty = Math.max(0, p.stock - item.q);
          db.prepare('UPDATE products SET stock=? WHERE id=?').run(newQty, p.id);
          db.prepare('INSERT INTO stock_log (product_id,delta,before_qty,after_qty,reason,actor) VALUES (?,?,?,?,?,?)')
            .run(p.id, -item.q, p.stock, newQty, `venda #${sale.id}`, sale.discord_tag || sale.discord_id);
        }
        if (p.delivery_type === 'manual') hasManualDelivery = true;
        if (p.role_id) {
          try {
            const tag = await bot.grantRole(meta.discord_id || sale.discord_id, p.role_id);
            tagsBought.push(p.name);
            if (!sale.discord_tag) db.prepare('UPDATE sales SET role_granted=1, discord_tag=? WHERE id=?').run(tag, sale.id);
            else db.prepare('UPDATE sales SET role_granted=1 WHERE id=?').run(sale.id);
          } catch (e) {
            require('../logger').error({ err: e, sale: sale.id, product: p.id }, 'erro ao dar cargo');
            logEvent({ type: 'erro', message: `Falha ao dar cargo de ${p.name}: ${e.message}`, discord_id: sale.discord_id });
          }
        }
        // Hook por produto
        if (p.hook_url) {
          fetch(p.hook_url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'purchase', sale_id: sale.id, product: p, buyer: { discord_id: sale.discord_id, tag: sale.discord_tag }, quantity: item.q })
          }).catch(() => {});
        }
      }

      if (hasManualDelivery) {
        try {
          const summary = cartItems.length === 1 ? firstProduct.name : `${cartItems.length} itens`;
          const channelId = await bot.openDeliveryTicket?.(sale.discord_id, sale.discord_tag, summary, sale.id);
          if (channelId) db.prepare(`UPDATE sales SET delivery_status='pending' WHERE id=?`).run(sale.id);
        } catch (e) { require('../logger').warn({ err: e }, 'falha ao abrir ticket de entrega'); }
      }

      const summary = cartItems.length > 1 ? `${cartItems.length} itens` : (firstProduct?.name || 'produto');
      logEvent({ type: 'venda', message: `Venda ${valueStr} — ${summary}`, discord_id: sale.discord_id });
      await bot.notifySaleChannel(`🛒 Nova venda: **${summary}** — <@${sale.discord_id}> · ${valueStr}`);
      bot.broadcast?.('venda', `${sale.discord_tag || sale.discord_id} comprou ${summary} (${valueStr})`, { payload: { discord_id: sale.discord_id, items: cartItems, amount_cents: sale.amount_cents } });

      if (cfg.dm_purchase === '1') {
        const list = cartItems.map(it => {
          const p = db.prepare('SELECT name FROM products WHERE id=?').get(it.id);
          return `• ${p?.name || '?'} x${it.q}`;
        }).join('\n');
        const expiryStr = expiresAt ? `\n⏰ Expira em: ${new Date(expiresAt * 1000).toLocaleDateString('pt-BR')}` : '\n♾️ Acesso permanente';
        await bot.dmUser(sale.discord_id, `✅ Compra confirmada — ${valueStr}\n\n${list}${expiryStr}\n\nObrigado pela compra! 🎉`);
      }

      if (cfg.dm_admin_on_sale === '1') {
        const list = cartItems.map(it => {
          const p = db.prepare('SELECT name,cost_cents FROM products WHERE id=?').get(it.id);
          return `• ${p?.name || '?'} x${it.q}`;
        }).join('\n');
        const profitNote = (() => {
          const totalCost = cartItems.reduce((s, it) => {
            const p = db.prepare('SELECT cost_cents FROM products WHERE id=?').get(it.id);
            return s + ((p?.cost_cents || 0) * it.q);
          }, 0);
          if (!totalCost) return '';
          const profit = sale.amount_cents - totalCost;
          return `\n💰 Lucro estimado: R$ ${(profit / 100).toFixed(2).replace('.', ',')}`;
        })();
        await bot.dmAdmins(`💸 **Nova venda!** ${valueStr}\n\n${list}\n\n👤 ${sale.discord_tag || sale.discord_id}${profitNote}`);
      }
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const pi = charge.payment_intent;
    const sale = db.prepare('SELECT * FROM sales WHERE stripe_payment_intent=?').get(pi);
    if (sale) {
      db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
      const items = parseCart(sale.cart_items);
      for (const it of items) {
        const p = db.prepare('SELECT role_id FROM products WHERE id=?').get(it.id);
        if (p?.role_id) await bot.revokeRole(sale.discord_id, p.role_id).catch(() => {});
      }
      logEvent({ type: 'reembolso', message: `Reembolso aplicado`, discord_id: sale.discord_id });
    }
  }

  res.json({ received: true });
});

function parseCart(json) {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function computeExpiry(duration) {
  if (!duration || duration === 'permanent') return null;
  const now = Math.floor(Date.now() / 1000);
  const map = { '1d': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '1y': 365 * 86400 };
  return now + (map[duration] || 0);
}

module.exports = router;
