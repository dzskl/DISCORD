// Catalogo de PSPs (pricing v3 — modelo intermediario).

const w = require('../src/config/wallet-providers');

test('catalogo tem MercadoPago, PushinPay, Stripe e NOWPayments', () => {
  assert(w.getProvider('mercadopago'), 'MercadoPago listado');
  assert(w.getProvider('pushinpay'),   'PushinPay listado');
  assert(w.getProvider('stripe'),      'Stripe listado');
  assert(w.getProvider('nowpayments'), 'NOWPayments listado');
});

test('listProviders filtra por method', () => {
  const pix = w.listProviders({ method: 'pix' });
  assert(pix.length >= 3, 'pelo menos 3 providers PIX');
  assert(pix.every(p => p.method === 'pix'), 'todos PIX');
});

test('listProviders filtra por country BR (inclui GLOBAL)', () => {
  const br = w.listProviders({ country: 'BR' });
  const ids = br.map(p => p.id);
  assert(ids.includes('mercadopago'), 'MP eh BR');
  assert(ids.includes('stripe'),      'Stripe (GLOBAL) tambem aparece em BR');
});

test('cada provider declara credenciais', () => {
  for (const p of w.listProviders()) {
    assert(Array.isArray(p.credentials) && p.credentials.length > 0,
      `${p.id} tem credentials`);
    for (const c of p.credentials) {
      assert(c.key && c.label && c.type, `${p.id} credential com key/label/type`);
    }
  }
});

test('providerFeature mapeia cada PSP a uma feature do plano', () => {
  assertEq(w.providerFeature('mercadopago'), 'mercadopago_checkout');
  assertEq(w.providerFeature('nowpayments'), 'crypto_checkout');
  assertEq(w.providerFeature('stripe'),      'stripe_checkout');
});
