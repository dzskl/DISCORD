// Asaas + AbacatePay connectors: parseWebhook + verifySignature + mapStatus.

const Asaas = require('../src/providers/wallet/asaas.connector');
const Abacate = require('../src/providers/wallet/abacatepay.connector');

test('Asaas: parseWebhook PAYMENT_CONFIRMED -> paid', () => {
  const c = new Asaas({ credentials: { ASAAS_API_KEY: 'x' } });
  const r = c.parseWebhook({
    body: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_001', value: 50.00, paymentDate: '2026-06-14T10:00:00Z' } },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, 'pay_001');
  assertEq(r.amount_cents, 5000);
});

test('Asaas: parseWebhook PAYMENT_REFUNDED -> refunded', () => {
  const c = new Asaas({ credentials: { ASAAS_API_KEY: 'x' } });
  const r = c.parseWebhook({
    body: { event: 'PAYMENT_REFUNDED', payment: { id: 'pay_002', value: 50.00 } },
    headers: {}
  });
  assertEq(r.event, 'refunded');
});

test('Asaas: mapStatus CONFIRMED -> paid', () => {
  const c = new Asaas({ credentials: { ASAAS_API_KEY: 'x' } });
  assertEq(c.mapStatus({ status: 'CONFIRMED' }), 'paid');
  assertEq(c.mapStatus({ status: 'RECEIVED' }), 'paid');
  assertEq(c.mapStatus({ status: 'OVERDUE' }), 'expired');
  assertEq(c.mapStatus({ status: 'REFUNDED' }), 'refunded');
  assertEq(c.mapStatus({ status: 'PENDING' }), 'pending');
});

test('Asaas: verifySignature compara token compartilhado', () => {
  const c = new Asaas({ credentials: { ASAAS_API_KEY: 'x' } });
  assertEq(c.verifySignature({ headers: { 'asaas-access-token': 'tok123' } }, 'tok123'), true);
  assertEq(c.verifySignature({ headers: { 'asaas-access-token': 'wrong' }  }, 'tok123'), false);
  assertEq(c.verifySignature({ headers: {}, query: { access_token: 'tok123' } }, 'tok123'), true);
  assertEq(c.verifySignature({ headers: {} }, null), true);  // lax
});

test('AbacatePay: parseWebhook PAID -> paid', () => {
  const c = new Abacate({ credentials: { ABACATE_API_KEY: 'x' } });
  const r = c.parseWebhook({
    body: { event: 'pix.paid', data: { id: 'abc_001', status: 'PAID', amount: 4500, paidAt: '2026-06-14T10:00:00Z' } },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, 'abc_001');
  assertEq(r.amount_cents, 4500);
});

test('AbacatePay: parseWebhook EXPIRED', () => {
  const c = new Abacate({ credentials: { ABACATE_API_KEY: 'x' } });
  const r = c.parseWebhook({ body: { data: { id: 'x', status: 'EXPIRED' } }, headers: {} });
  assertEq(r.event, 'expired');
});

test('AbacatePay: mapStatus', () => {
  const c = new Abacate({ credentials: { ABACATE_API_KEY: 'x' } });
  assertEq(c.mapStatus({ data: { status: 'PAID' } }), 'paid');
  assertEq(c.mapStatus({ status: 'EXPIRED' }), 'expired');
  assertEq(c.mapStatus({ status: 'PENDING' }), 'pending');
});

test('AbacatePay: verifySignature compara secret no header', () => {
  const c = new Abacate({ credentials: { ABACATE_API_KEY: 'x' } });
  assertEq(c.verifySignature({ headers: { 'x-abacate-webhook-secret': 'foo' } }, 'foo'), true);
  assertEq(c.verifySignature({ headers: { webhooksecret: 'foo' } }, 'foo'), true);
  assertEq(c.verifySignature({ headers: { 'x-abacate-webhook-secret': 'bar' } }, 'foo'), false);
});

test('Registry agora inclui asaas + abacatepay', () => {
  const reg = require('../src/providers/wallet');
  assertEq(reg.isSupported('asaas'), true);
  assertEq(reg.isSupported('abacatepay'), true);
});

test('MP refundPayment existe (smoke)', () => {
  const MP = require('../src/providers/wallet/mercadopago.connector');
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  assert(typeof c.refundPayment === 'function', 'refundPayment definido no MP');
});

test('Asaas refundPayment existe (smoke)', () => {
  const c = new Asaas({ credentials: { ASAAS_API_KEY: 'x' } });
  assert(typeof c.refundPayment === 'function');
});
