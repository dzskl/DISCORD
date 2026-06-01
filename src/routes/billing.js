const express = require('express');
const { db, getCredential } = require('../db');
const { PLANS, getPlan, ownerPlan, serializePlan } = require('../plans');
const audit = require('../audit');

const router = express.Router();

function stripe() {
  const key = getCredential('STRIPE_SECRET_KEY');
  if (!key) return null;
  return require('stripe')(key);
}

function planPriceIds() {
  return {
    pro_monthly: getCredential('STRIPE_PRICE_PRO_MONTHLY') || process.env.STRIPE_PRICE_PRO_MONTHLY
  };
}

// ---------- GET /me — plano atual ----------
router.get('/me', (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  const plan = ownerPlan();
  const myUser = db.prepare('SELECT plan, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_ends_at, trial_ends_at FROM users WHERE id=?').get(req.appUser.id);

  const owner = db.prepare(`SELECT id,email,plan,subscription_status,subscription_ends_at FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1`).get();
  const isOwner = req.appUser.role === 'owner';

  res.json({
    plan_id: plan.id,
    plan: serializePlan(plan),
    is_owner: isOwner,
    owner_email: owner?.email,
    my_subscription: myUser ? {
      status: myUser.subscription_status,
      ends_at: myUser.subscription_ends_at,
      trial_ends_at: myUser.trial_ends_at,
      has_stripe_customer: !!myUser.stripe_customer_id
    } : null,
    plans_available: Object.values(PLANS).map(p => serializePlan(p))
  });
});

// ---------- POST /checkout — cria sessao Stripe Checkout pra assinatura ----------
router.post('/checkout', async (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  if (req.appUser.role !== 'owner') return res.status(403).json({ error: 'apenas owner pode assinar plano' });

  const s = stripe();
  if (!s) return res.status(503).json({ error: 'Stripe nao configurado' });

  const { plan } = req.body || {};
  if (plan !== 'pro') return res.status(400).json({ error: 'plano invalido' });

  const prices = planPriceIds();
  if (!prices.pro_monthly) return res.status(503).json({ error: 'STRIPE_PRICE_PRO_MONTHLY nao configurado nas credenciais' });

  const owner = db.prepare('SELECT * FROM users WHERE id=?').get(req.appUser.id);
  let customerId = owner.stripe_customer_id;

  try {
    if (!customerId) {
      const customer = await s.customers.create({
        email: owner.email,
        name: owner.display_name || owner.email,
        metadata: { user_id: String(owner.id) }
      });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(customerId, owner.id);
    }

    const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: prices.pro_monthly, quantity: 1 }],
      success_url: `${publicUrl}/app.html?billing=success`,
      cancel_url: `${publicUrl}/app.html?billing=cancel`,
      allow_promotion_codes: true,
      metadata: { user_id: String(owner.id), plan }
    });

    audit.log({ req, action: 'billing.checkout_created', target_type: 'subscription', target_id: session.id });
    res.json({ ok: true, url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST /portal — abre Stripe Customer Portal ----------
router.post('/portal', async (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  if (req.appUser.role !== 'owner') return res.status(403).json({ error: 'apenas owner' });

  const s = stripe();
  if (!s) return res.status(503).json({ error: 'Stripe nao configurado' });

  const owner = db.prepare('SELECT stripe_customer_id FROM users WHERE id=?').get(req.appUser.id);
  if (!owner?.stripe_customer_id) return res.status(400).json({ error: 'nenhuma assinatura ativa' });

  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  try {
    const portal = await s.billingPortal.sessions.create({
      customer: owner.stripe_customer_id,
      return_url: `${publicUrl}/app.html`
    });
    res.json({ ok: true, url: portal.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- WEBHOOK Stripe Subscription ----------
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).send('Stripe nao configurado');

  const secret = getCredential('STRIPE_BILLING_WEBHOOK_SECRET') || getCredential('STRIPE_WEBHOOK_SECRET');
  let event;
  try {
    event = secret
      ? s.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const obj = event.data?.object || {};
  const customerId = obj.customer || obj.customer_id;
  let user = customerId ? db.prepare('SELECT * FROM users WHERE stripe_customer_id=?').get(customerId) : null;

  // se nao achou pelo customer, tenta achar pelo metadata
  if (!user && event.type === 'checkout.session.completed' && obj.metadata?.user_id) {
    user = db.prepare('SELECT * FROM users WHERE id=?').get(parseInt(obj.metadata.user_id));
  }

  if (!user) {
    require('../logger').warn({ event_type: event.type, customer: customerId }, 'webhook billing: user nao encontrado');
    return res.json({ received: true });
  }

  db.prepare(`INSERT INTO subscription_events (user_id,event,stripe_event_id,data) VALUES (?,?,?,?)`)
    .run(user.id, event.type, event.id, JSON.stringify(obj).slice(0, 2000));

  switch (event.type) {
    case 'checkout.session.completed': {
      const subId = obj.subscription;
      if (subId) {
        const sub = await s.subscriptions.retrieve(subId);
        applySubscription(user.id, sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      applySubscription(user.id, obj);
      break;
    }
    case 'customer.subscription.deleted': {
      db.prepare(`UPDATE users SET plan='free', subscription_status='canceled' WHERE id=?`).run(user.id);
      break;
    }
    case 'invoice.payment_failed': {
      db.prepare(`UPDATE users SET subscription_status='past_due' WHERE id=?`).run(user.id);
      // notificar via DM/email seria aqui
      break;
    }
    case 'invoice.paid': {
      const subId = obj.subscription;
      if (subId) {
        const sub = await s.subscriptions.retrieve(subId);
        applySubscription(user.id, sub);
      }
      break;
    }
  }

  res.json({ received: true });
});

function applySubscription(userId, sub) {
  const status = sub.status;
  const endsAt = sub.current_period_end || null;
  const trialEnds = sub.trial_end || null;
  const planFromSub = mapPriceToPlan(sub.items?.data?.[0]?.price?.id);
  const newPlan = ['active', 'trialing'].includes(status) ? (planFromSub || 'pro') : 'free';

  db.prepare(`
    UPDATE users SET
      stripe_subscription_id = ?,
      plan = ?,
      subscription_status = ?,
      subscription_ends_at = ?,
      trial_ends_at = ?
    WHERE id = ?
  `).run(sub.id, newPlan, status, endsAt, trialEnds, userId);
}

function mapPriceToPlan(priceId) {
  if (!priceId) return null;
  const prices = planPriceIds();
  if (priceId === prices.pro_monthly) return 'pro';
  return null;
}

module.exports = router;
