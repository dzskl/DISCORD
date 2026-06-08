const express = require('express');
const crypto = require('crypto');
const { db, logEvent, getConfig } = require('../database/connection');
const bot = require('../services/bot.service');
const mp = require('../services/misticpay.service');

const router = express.Router();

// Body parser local pras rotas que recebem JSON (o webhook usa express.raw localizado).
// Importante: nao usa express.json no router inteiro pra nao consumir o raw do webhook.
const jsonParser = express.json({ limit: '128kb' });

// Cria uma cobranca PIX via MisticPay e retorna QR code + copy/paste
router.post('/create', jsonParser, async (req, res) => {
  if (!mp.isConfigured()) return res.status(503).json({ error: 'MisticPay nao configurado' });

  let { product_id, items, discord_id, discord_tag, coupon_code, affiliate_code, payer_name, payer_document } = req.body || {};
  if (!discord_id) return res.status(400).json({ error: 'discord_id obrigatorio' });

  if (!Array.isArray(items) || !items.length) {
    if (!product_id) return res.status(400).json({ error: 'items ou product_id obrigatorio' });
    items = [{ product_id: parseInt(product_id), quantity: 1 }];
  }

  // Valida produtos + estoque
  const cartProducts = [];
  for (const it of items) {
    const qty = Math.max(1, parseInt(it.quantity) || 1);
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.product_id);
    if (!p) return res.status(404).json({ error: `produto ${it.product_id} nao encontrado` });
    if (p.stock != null && p.stock < qty) return res.status(400).json({ error: `${p.name} sem estoque suficiente` });
    cartProducts.push({ product: p, quantity: qty });
  }

  let subtotal = cartProducts.reduce((s, x) => s + x.product.price_cents * x.quantity, 0);

  // Cupom
  let coupon = null;
  if (coupon_code) {
    coupon = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(coupon_code.trim().toUpperCase());
    if (!coupon) return res.status(400).json({ error: 'cupom invalido' });
    if (coupon.expires_at && coupon.expires_at < Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'cupom expirado' });
    if (coupon.max_uses != null && coupon.uses >= coupon.max_uses) return res.status(400).json({ error: 'cupom esgotado' });
    if (coupon.min_amount_cents && subtotal < coupon.min_amount_cents) return res.status(400).json({ error: `valor minimo de R$ ${(coupon.min_amount_cents / 100).toFixed(2).replace('.', ',')}` });
    subtotal = Math.max(50, subtotal - Math.round(subtotal * coupon.discount_percent / 100));
  }

  // Taxa repassada
  const cfg = getConfig();
  let total = subtotal;
  if (cfg.pass_fees_to_customer === '1') {
    const pct = parseFloat(cfg.fee_percent || '4') / 100;
    const fixed = parseInt(cfg.fee_fixed_cents || '39');
    total = subtotal + Math.round(subtotal * pct / (1 - pct)) + fixed;
  }

  // Afiliado
  let affiliate = null;
  if (affiliate_code) {
    affiliate = db.prepare('SELECT * FROM affiliates WHERE code=? AND active=1').get(affiliate_code.trim().toUpperCase());
  }

  const cart_meta = cartProducts.map(({ product, quantity }) => ({ id: product.id, q: quantity }));
  const ourTxId = 'BOT-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const description = cartProducts.length === 1
    ? cartProducts[0].product.name
    : `${cartProducts.length} itens`;

  try {
    const tx = await mp.createPixTransaction({
      amount_cents: total,
      payerName: payer_name || discord_tag || 'Cliente Discord',
      payerDocument: payer_document || '00000000000',
      transactionId: ourTxId,
      description
    });

    const mpTxId = tx.transactionId || tx.id || ourTxId;

    db.prepare(`
      INSERT INTO sales (product_id,discord_id,discord_tag,amount_cents,status,stripe_session_id,cart_items,affiliate_id)
      VALUES (?,?,?,?, 'pending', ?, ?, ?)
    `).run(
      cartProducts[0].product.id,
      discord_id,
      discord_tag || null,
      total,
      'mp:' + mpTxId,
      JSON.stringify(cart_meta),
      affiliate?.id || null
    );

    res.json({
      ok: true,
      gateway: 'misticpay',
      transaction_id: mpTxId,
      qr_code_base64: tx.qrcode_base64 || tx.qrCodeBase64 || tx.qr_base64 || tx.qrcode,
      copy_paste: tx.copy_paste || tx.copyPaste || tx.brcode || tx.pixCopyPaste,
      amount_cents: total,
      status: tx.status || 'PENDENTE'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Polling de status — o frontend chama esse cada 3s
router.get('/status/:tx', async (req, res) => {
  try {
    const tx = req.params.tx;
    const sale = db.prepare('SELECT * FROM sales WHERE stripe_session_id=?').get('mp:' + tx);
    if (!sale) return res.status(404).json({ error: 'transacao nao encontrada' });
    if (sale.status === 'paid') return res.json({ status: 'paid', sale_id: sale.id });

    // Consulta API pra ver o status real
    let remoteStatus = null;
    try {
      const remote = await mp.getTransaction(tx);
      remoteStatus = (remote.status || '').toUpperCase();
    } catch {}

    if (remoteStatus === 'APROVADO' || remoteStatus === 'APPROVED' || remoteStatus === 'PAID' || remoteStatus === 'PAGO') {
      await markPaid(sale, tx);
      return res.json({ status: 'paid', sale_id: sale.id });
    }
    res.json({ status: 'pending', remote: remoteStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Webhook (configurado no painel MisticPay apontando aqui)
// Usa express.raw pra preservar o body cru e validar HMAC.
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const wh = require('../services/webhook-security.service');
  const log = require('../utils/logger');
  let eventRowId = null;
  try {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body || '');
    let payload = {};
    try { payload = JSON.parse(rawBody || '{}'); } catch {}

    // 1. Valida assinatura
    const sigHeader = req.headers['x-signature'] || req.headers['x-webhook-signature'] || req.headers['signature'];
    const sigResult = wh.verifyMisticPaySignature(rawBody, sigHeader);
    if (sigResult.ok === false) {
      log.warn({ sigHeader }, 'misticpay webhook: assinatura invalida — rejeitado');
      return res.status(401).send('invalid signature');
    }

    const txId = payload.transactionId || payload.id || payload.data?.transactionId;
    const eventType = payload.event || payload.type || payload.status || null;
    const eventId = wh.extractEventId('misticpay', payload, rawBody);

    // 2. Registra evento (UNIQUE constraint detecta duplicidade)
    const rec = wh.recordEvent({
      gateway: 'misticpay',
      event_id: eventId,
      event_type: eventType,
      transaction_id: txId || null,
      payload,
      signature_ok: sigResult.ok
    });
    eventRowId = rec.id;
    if (rec.duplicate) {
      // Idempotencia: ja foi processado antes, devolve 200 sem refazer
      return res.json({ received: true, duplicate: true });
    }

    if (!txId) {
      wh.markFailed(eventRowId, 'missing transactionId');
      return res.status(400).send('missing transactionId');
    }

    const sale = db.prepare('SELECT * FROM sales WHERE stripe_session_id=?').get('mp:' + txId);
    if (!sale) {
      wh.markProcessed(eventRowId, null); // evento valido mas sem sale correspondente
      return res.json({ received: true });
    }
    if (sale.status === 'paid') {
      wh.markProcessed(eventRowId, sale.id);
      return res.json({ received: true });
    }

    // 3. Confirma com a API antes de aceitar como pago
    let confirmed = false;
    try {
      const remote = await mp.getTransaction(txId);
      const status = (remote.status || '').toUpperCase();
      confirmed = ['APROVADO', 'APPROVED', 'PAID', 'PAGO'].includes(status);
    } catch (e) {
      log.warn({ err: e, txId }, 'misticpay webhook: erro consultando getTransaction');
    }

    if (confirmed) {
      await markPaid(sale, txId);
      wh.markProcessed(eventRowId, sale.id);
    } else {
      wh.markProcessed(eventRowId, sale.id);
    }
    res.json({ received: true });
  } catch (e) {
    require('../utils/logger').error({ err: e }, 'misticpay webhook erro');
    if (eventRowId) {
      try { wh.markFailed(eventRowId, e.message); } catch {}
    }
    res.status(500).send('erro');
  }
});

async function markPaid(sale, txId) {
  if (sale.status === 'paid') return;

  const cart = JSON.parse(sale.cart_items || '[]');
  const firstProduct = db.prepare('SELECT * FROM products WHERE id=?').get(sale.product_id);
  const expiresAt = computeExpiry(firstProduct?.duration);

  db.prepare(`UPDATE sales SET status='paid', paid_at=strftime('%s','now'), expires_at=? WHERE id=?`)
    .run(expiresAt, sale.id);

  // Taxa da plataforma (% + fixa)
  try { require('../config/platform-fee').applyFeeToSale(db, sale.id); } catch {}
  // Hold period escalonado por tier do vendedor
  try { require('../config/hold-period').applyHoldToSale(db, sale.id); } catch {}

  const cfg = getConfig();
  const valueStr = `R$${(sale.amount_cents / 100).toFixed(2).replace('.', ',')}`;
  let hasManualDelivery = false;

  for (const item of cart) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
    if (!p) continue;
    if (p.stock != null) {
      const newQty = Math.max(0, p.stock - item.q);
      db.prepare('UPDATE products SET stock=? WHERE id=?').run(newQty, p.id);
      db.prepare('INSERT INTO stock_log (product_id,delta,before_qty,after_qty,reason,actor) VALUES (?,?,?,?,?,?)')
        .run(p.id, -item.q, p.stock, newQty, `venda #${sale.id} (mp)`, sale.discord_tag || sale.discord_id);
    }
    if (p.delivery_type === 'manual') hasManualDelivery = true;
    if (p.role_id) {
      try {
        const tag = await bot.grantRole(sale.discord_id, p.role_id);
        if (!sale.discord_tag) db.prepare('UPDATE sales SET role_granted=1, discord_tag=? WHERE id=?').run(tag, sale.id);
        else db.prepare('UPDATE sales SET role_granted=1 WHERE id=?').run(sale.id);
      } catch (e) {
        require('../utils/logger').error({ err: e, sale: sale.id, product: p.id }, 'erro ao dar cargo');
      }
    }
    if (p.hook_url) {
      fetch(p.hook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'purchase', sale_id: sale.id, product: p, buyer: { discord_id: sale.discord_id }, quantity: item.q }) }).catch(() => {});
    }
  }

  if (sale.affiliate_id) {
    const aff = db.prepare('SELECT * FROM affiliates WHERE id=?').get(sale.affiliate_id);
    if (aff) {
      const commission = Math.round(sale.amount_cents * aff.commission_percent / 100);
      db.prepare('UPDATE sales SET commission_cents=? WHERE id=?').run(commission, sale.id);
      db.prepare('UPDATE affiliates SET total_sales=total_sales+1, total_commission_cents=total_commission_cents+? WHERE id=?').run(commission, aff.id);
      await bot.dmUser(aff.discord_id, `💰 Voce ganhou R$ ${(commission / 100).toFixed(2).replace('.', ',')} de comissao!`).catch(() => {});
    }
  }

  const summary = cart.length === 1 ? (firstProduct?.name || 'produto') : `${cart.length} itens`;
  logEvent({ type: 'venda', message: `Venda PIX ${valueStr} — ${summary}`, discord_id: sale.discord_id });
  await bot.notifySaleChannel(`🛒 Nova venda (PIX): **${summary}** — <@${sale.discord_id}> · ${valueStr}`);

  if (cfg.dm_purchase === '1') {
    const list = cart.map(it => { const p = db.prepare('SELECT name FROM products WHERE id=?').get(it.id); return `• ${p?.name || '?'} x${it.q}`; }).join('\n');
    const expiryStr = expiresAt ? `\n⏰ Expira em: ${new Date(expiresAt * 1000).toLocaleDateString('pt-BR')}` : '\n♾️ Permanente';
    await bot.dmUser(sale.discord_id, `✅ Pagamento confirmado (PIX) — ${valueStr}\n\n${list}${expiryStr}`);
  }
  if (cfg.dm_admin_on_sale === '1') {
    await bot.dmAdmins(`💸 **Nova venda PIX!** ${valueStr} — ${sale.discord_tag || sale.discord_id}`);
  }

  if (hasManualDelivery) {
    try {
      const summaryFmt = cart.length === 1 ? firstProduct.name : `${cart.length} itens`;
      await bot.openDeliveryTicket?.(sale.discord_id, sale.discord_tag, summaryFmt, sale.id);
    } catch {}
  }
}

function computeExpiry(duration) {
  if (!duration || duration === 'permanent') return null;
  const now = Math.floor(Date.now() / 1000);
  const map = { '1d': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '1y': 365 * 86400 };
  return now + (map[duration] || 0);
}

module.exports = router;
