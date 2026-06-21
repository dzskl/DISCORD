// Stripe + MisticPay connectors — parseWebhook + mapStatus + verifySignature.
// Nao chama API real (Stripe SDK precisaria de mock pesado).

const Stripe = require('../src/providers/wallet/stripe.connector');
const Mistic = require('../src/providers/wallet/misticpay.connector');

test('Stripe: parseWebhook checkout.session.completed -> paid', () => {
  const c = new Stripe({ credentials: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  const r = c.parseWebhook({
    body: {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_001', amount_total: 5000 } }
    },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, 'cs_test_001');
  assertEq(r.amount_cents, 5000);
});

test('Stripe: parseWebhook session.expired -> expired', () => {
  const c = new Stripe({ credentials: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  const r = c.parseWebhook({
    body: { type: 'checkout.session.expired', data: { object: { id: 'cs_x' } } },
    headers: {}
  });
  assertEq(r.event, 'expired');
});

test('Stripe: parseWebhook charge.refunded -> refunded', () => {
  const c = new Stripe({ credentials: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  const r = c.parseWebhook({
    body: { type: 'charge.refunded', data: { object: { payment_intent: 'pi_001', amount_refunded: 3000 } } },
    headers: {}
  });
  assertEq(r.event, 'refunded');
  assertEq(r.external_id, 'pi_001');
});

test('Stripe: mapStatus paid/expired/pending', () => {
  const c = new Stripe({ credentials: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  assertEq(c.mapStatus({ payment_status: 'paid' }), 'paid');
  assertEq(c.mapStatus({ status: 'complete' }), 'paid');
  assertEq(c.mapStatus({ status: 'expired' }), 'expired');
  assertEq(c.mapStatus({ payment_status: 'unpaid' }), 'pending');
});

test('Stripe: verifySignature sem rawBody rejeita', () => {
  const c = new Stripe({ credentials: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  const ok = c.verifySignature({ headers: { 'stripe-signature': 't=1,v1=abc' }, body: {} }, 'whsec_x');
  assertEq(ok, false, 'sem rawBody nao da pra validar');
});

test('Stripe: refundPayment existe (smoke)', () => {
  const c = new Stripe({ credentials: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  assert(typeof c.refundPayment === 'function');
});

test('MisticPay: parseWebhook paid', () => {
  const c = new Mistic({ credentials: { MISTICPAY_CLIENT_ID: 'a', MISTICPAY_CLIENT_SECRET: 'b' } });
  const r = c.parseWebhook({
    body: { transactionId: 'tx_001', status: 'paid', paid_at: '2026-06-14T10:00:00Z' },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, 'tx_001');
  assert(r.paid_at > 0);
});

test('MisticPay: parseWebhook expired', () => {
  const c = new Mistic({ credentials: { MISTICPAY_CLIENT_ID: 'a', MISTICPAY_CLIENT_SECRET: 'b' } });
  assertEq(c.parseWebhook({ body: { id: 'x', status: 'expired' }, headers: {} }).event, 'expired');
});

test('MisticPay: mapStatus', () => {
  const c = new Mistic({ credentials: { MISTICPAY_CLIENT_ID: 'a', MISTICPAY_CLIENT_SECRET: 'b' } });
  assertEq(c.mapStatus({ status: 'paid' }), 'paid');
  assertEq(c.mapStatus({ status: 'approved' }), 'paid');
  assertEq(c.mapStatus({ status: 'expired' }), 'expired');
  assertEq(c.mapStatus({ status: 'pending' }), 'pending');
});

test('MisticPay: verifySignature HMAC-SHA256 com id:status', () => {
  const crypto = require('crypto');
  const c = new Mistic({ credentials: { MISTICPAY_CLIENT_ID: 'a', MISTICPAY_CLIENT_SECRET: 'b' } });
  const secret = 'webhook-sec';
  const sig = crypto.createHmac('sha256', secret).update('tx_999:paid').digest('hex');
  const ok = c.verifySignature({
    headers: { 'x-misticpay-signature': sig },
    body: { transactionId: 'tx_999', status: 'paid' }
  }, secret);
  assertEq(ok, true);
  const bad = c.verifySignature({
    headers: { 'x-misticpay-signature': 'deadbeef' },
    body: { transactionId: 'tx_999', status: 'paid' }
  }, secret);
  assertEq(bad, false);
});

test('Registry agora inclui stripe + misticpay', () => {
  const reg = require('../src/providers/wallet');
  assertEq(reg.isSupported('stripe'), true);
  assertEq(reg.isSupported('misticpay'), true);
});

test('Asaas: PAYMENT_CHARGEBACK_REQUESTED -> med_returned', () => {
  const Asaas = require('../src/providers/wallet/asaas.connector');
  const c = new Asaas({ credentials: { ASAAS_API_KEY: 'x' } });
  const r = c.parseWebhook({
    body: { event: 'PAYMENT_CHARGEBACK_REQUESTED', payment: { id: 'p_med', value: 100 } },
    headers: {}
  });
  assertEq(r.event, 'med_returned');
  assert(r.reason, 'reason preenchido');
});

test('MED handler: marca sale como med_returned + notifica', () => {
  const { db } = require('../src/database/connection');
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, net_to_owner_cents, paid_at, guild_id)
    VALUES ('123456789012345678', 10000, 'paid', '[]', 'asaas', 'med-test', 10000, strftime('%s','now'), NULL)
  `).run();
  const saleId = info.lastInsertRowid;
  // garante users.id=1 pra notification
  try { db.prepare(`INSERT INTO users (id, email, password_hash, role, active) VALUES (1, 'o@o', 'x', 'owner', 1)`).run(); } catch {}
  const med = require('../src/services/med.service');
  const r = med.handleMedReturn(saleId, { reason: 'teste' });
  // handleMedReturn eh async mas usa db sync — vamos pegar promise
  return r.then ? r.then(() => {
    const s = db.prepare(`SELECT status FROM sales WHERE id=?`).get(saleId);
    assertEq(s.status, 'med_returned');
  }) : (() => {
    const s = db.prepare(`SELECT status FROM sales WHERE id=?`).get(saleId);
    assertEq(s.status, 'med_returned');
  })();
});

test('MED handler: idempotente (segunda chamada -> already_processed)', () => {
  const { db } = require('../src/database/connection');
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, net_to_owner_cents, paid_at)
    VALUES ('123456789012345678', 5000, 'med_returned', '[]', 'asaas', 'med-idemp', 5000, strftime('%s','now'))
  `).run();
  const med = require('../src/services/med.service');
  return med.handleMedReturn(info.lastInsertRowid).then(r => {
    assertEq(r.already_processed, true);
  });
});
