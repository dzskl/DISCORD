// Connectors de PSP — interface comum + parseWebhook + verifySignature.
// Nao chama API externa.

const crypto = require('crypto');
const { BaseConnector, centsToReaisString, reaisStringToCents } = require('../src/providers/wallet/base.connector');
const MP   = require('../src/providers/wallet/mercadopago.connector');
const PP   = require('../src/providers/wallet/pushinpay.connector');
const NOW  = require('../src/providers/wallet/nowpayments.connector');

test('Base: ensureCreds falha se faltar credencial', () => {
  class X extends BaseConnector {}
  X.REQUIRED_CREDS = ['FOO'];
  const c = new X({ providerId: 'x', credentials: {} });
  let threw = false;
  try { c.ensureCreds(); } catch (e) { threw = e.code === 'missing_credentials'; }
  assert(threw, 'deve jogar missing_credentials');
});

test('Base: centsToReaisString / reaisStringToCents round-trip', () => {
  assertEq(centsToReaisString(12345), '123.45');
  assertEq(reaisStringToCents('123,45'), 12345);
  assertEq(reaisStringToCents('1.99'), 199);
});

test('MP: parseWebhook v2 extrai data.id', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  const r = c.parseWebhook({
    body: { action: 'payment.updated', data: { id: '12345' } },
    query: {}, headers: {}
  });
  assertEq(r.event, 'pending_fetch');
  assertEq(r.external_id, '12345');
});

test('MP: parseWebhook IPN extrai ?id', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  const r = c.parseWebhook({
    body: {}, query: { topic: 'payment', id: '999' }, headers: {}
  });
  assertEq(r.external_id, '999');
});

test('MP: mapStatus mapeia approved->paid', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  assertEq(c.mapStatus({ status: 'approved' }), 'paid');
  assertEq(c.mapStatus({ status: 'refunded' }), 'refunded');
  assertEq(c.mapStatus({ status: 'pending' }), 'pending');
  assertEq(c.mapStatus({ status: 'cancelled' }), 'expired');
});

test('MP: verifySignature aceita ausencia de secret (modo lax)', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  assertEq(c.verifySignature({ headers: {} }, null), true);
});

test('MP: verifySignature valida HMAC correto', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  const secret = 'webhook-secret';
  const ts = '1700000000';
  const requestId = 'req-1';
  const dataId = '777';
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(template).digest('hex');
  const ok = c.verifySignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: { data: { id: dataId } }, query: {}
  }, secret);
  assertEq(ok, true);
});

test('MP: verifySignature rejeita HMAC errado', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  const ok = c.verifySignature({
    headers: { 'x-signature': 'ts=1,v1=deadbeef'.padEnd(70, '0'), 'x-request-id': 'r' },
    body: { data: { id: '1' } }, query: {}
  }, 'real-secret');
  assertEq(ok, false);
});

test('PushinPay: parseWebhook paid', () => {
  const c = new PP({ credentials: { PUSHINPAY_TOKEN: 'x' } });
  const r = c.parseWebhook({
    body: { id: 'abc', status: 'paid', value: 1500, paid_at: '2026-01-01T10:00:00Z' },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, 'abc');
  assertEq(r.amount_cents, 1500);
  assert(r.paid_at > 0, 'paid_at preenchido');
});

test('PushinPay: parseWebhook expired', () => {
  const c = new PP({ credentials: { PUSHINPAY_TOKEN: 'x' } });
  const r = c.parseWebhook({ body: { id: 'x', status: 'expired' }, headers: {} });
  assertEq(r.event, 'expired');
});

test('PushinPay: verifySignature compara secret no header', () => {
  const c = new PP({ credentials: { PUSHINPAY_TOKEN: 'x' } });
  assertEq(c.verifySignature({ headers: { 'x-pushinpay-webhook-secret': 'foo' } }, 'foo'), true);
  assertEq(c.verifySignature({ headers: { 'x-pushinpay-webhook-secret': 'bar' } }, 'foo'), false);
  assertEq(c.verifySignature({ headers: {} }, 'foo'), false);
  assertEq(c.verifySignature({ headers: {} }, null), true);  // lax
});

test('NOWPayments: parseWebhook finished -> paid', () => {
  const c = new NOW({ credentials: { NOWPAYMENTS_API_KEY: 'x' } });
  const r = c.parseWebhook({
    body: { payment_id: '777', payment_status: 'finished', updated_at: '2026-01-01T10:00:00Z' },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, '777');
});

test('NOWPayments: parseWebhook expired/failed', () => {
  const c = new NOW({ credentials: { NOWPAYMENTS_API_KEY: 'x' } });
  assertEq(c.parseWebhook({ body: { payment_id: '1', payment_status: 'expired' }, headers: {} }).event, 'expired');
  assertEq(c.parseWebhook({ body: { payment_id: '1', payment_status: 'failed'  }, headers: {} }).event, 'expired');
  assertEq(c.parseWebhook({ body: { payment_id: '1', payment_status: 'refunded'}, headers: {} }).event, 'refunded');
});

test('NOWPayments: verifySignature HMAC-SHA512 com sorted keys', () => {
  const c = new NOW({ credentials: { NOWPAYMENTS_API_KEY: 'x' } });
  const secret = 'ipn-secret';
  const body = { payment_id: 1, payment_status: 'finished', actually_paid: 0.5 };
  const sorted = { actually_paid: 0.5, payment_id: 1, payment_status: 'finished' };
  const sig = crypto.createHmac('sha512', secret).update(JSON.stringify(sorted)).digest('hex');
  const ok = c.verifySignature({ headers: { 'x-nowpayments-sig': sig }, body }, secret);
  assertEq(ok, true);
  const bad = c.verifySignature({ headers: { 'x-nowpayments-sig': 'deadbeef'.padEnd(128, '0') }, body }, secret);
  assertEq(bad, false);
});

test('Registry: isSupported + isConfigured', () => {
  const reg = require('../src/providers/wallet');
  assertEq(reg.isSupported('mercadopago'), true);
  assertEq(reg.isSupported('inventado'),   false);
  // sem credenciais salvas, configured deve ser false
  assertEq(reg.isConfigured('mercadopago'), false);
});

test('Registry: instantiate joga em provider nao suportado', () => {
  const reg = require('../src/providers/wallet');
  let threw = false;
  try { reg.instantiate('nope'); } catch (e) { threw = e.code === 'provider_unsupported'; }
  assert(threw, 'deve jogar provider_unsupported');
});
