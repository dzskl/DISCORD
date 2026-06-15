// Efi connector + MP MED detection + wallet-sales endpoint.

const Efi = require('../src/providers/wallet/efi.connector');
const MP  = require('../src/providers/wallet/mercadopago.connector');

test('Efi: ensureCreds falha sem cert', () => {
  const c = new Efi({ credentials: {} });
  let threw = false;
  try { c.ensureCreds(); } catch (e) { threw = e.code === 'missing_credentials'; }
  assert(threw);
});

test('Efi: cert() joga quando EFI_CERTIFICATE ausente', () => {
  const c = new Efi({ credentials: { EFI_CLIENT_ID: 'a', EFI_CLIENT_SECRET: 'b', EFI_CERTIFICATE: '' } });
  let code = null;
  try { c.cert(); } catch (e) { code = e.code; }
  assertEq(code, 'efi_no_cert');
});

test('Efi: parseWebhook extrai pix[0].txid', () => {
  const c = new Efi({ credentials: {} });
  const r = c.parseWebhook({
    body: { pix: [{ txid: 'BOTDASH001', valor: '50.00', horario: '2026-06-14T10:00:00Z' }] },
    headers: {}
  });
  assertEq(r.event, 'paid');
  assertEq(r.external_id, 'BOTDASH001');
  assertEq(r.amount_cents, 5000);
  assert(r.paid_at > 0);
});

test('Efi: mapStatus CONCLUIDA -> paid', () => {
  const c = new Efi({ credentials: {} });
  assertEq(c.mapStatus({ status: 'CONCLUIDA' }), 'paid');
  assertEq(c.mapStatus({ status: 'ATIVA' }), 'pending');
  assertEq(c.mapStatus({ status: 'REMOVIDA_PELO_PSP' }), 'expired');
});

test('Efi: verifySignature compara secret no header', () => {
  const c = new Efi({ credentials: {} });
  assertEq(c.verifySignature({ headers: { 'x-efi-webhook-secret': 'foo' } }, 'foo'), true);
  assertEq(c.verifySignature({ headers: { 'x-efi-webhook-secret': 'bar' } }, 'foo'), false);
  assertEq(c.verifySignature({ headers: {} }, null), true);  // lax
});

test('MP: mapStatus refunded sem dispute -> refunded', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  assertEq(c.mapStatus({ status: 'refunded', refunds: [{ reason: 'requested_by_customer' }] }), 'refunded');
  assertEq(c.mapStatus({ status: 'refunded', refunds: [] }), 'refunded');
});

test('MP: mapStatus refunded com dispute -> med_returned', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  assertEq(c.mapStatus({ status: 'refunded', refunds: [{ reason: 'disputa do banco' }] }), 'med_returned');
  assertEq(c.mapStatus({ status: 'refunded', refunds: [{ refund_mode: 'CHARGEBACK' }] }), 'med_returned');
});

test('MP: mapStatus charged_back -> med_returned', () => {
  const c = new MP({ credentials: { MP_ACCESS_TOKEN: 'x' } });
  assertEq(c.mapStatus({ status: 'charged_back' }), 'med_returned');
});

test('Registry: efi disponivel + 8 providers no total', () => {
  const reg = require('../src/providers/wallet');
  assertEq(reg.isSupported('efi'), true);
  // Verifica que temos pelo menos os 8 PSPs registrados
  const expected = ['mercadopago', 'pushinpay', 'nowpayments', 'asaas', 'abacatepay', 'stripe', 'misticpay', 'efi'];
  for (const id of expected) assertEq(reg.isSupported(id), true, `${id} suportado`);
});
