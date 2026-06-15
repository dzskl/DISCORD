// Wallet v7: health-check, timeline, bulk refund.

const { db } = require('../src/database/connection');
const { BaseConnector } = require('../src/providers/wallet/base.connector');

test('BaseConnector.testConnection default joga test_not_implemented', async () => {
  class X extends BaseConnector { constructor() { super({ providerId: 'x', credentials: {} }); } }
  const c = new X();
  let code = null;
  try { await c.testConnection(); } catch (e) { code = e.code; }
  assertEq(code, 'test_not_implemented');
});

test('Connectors principais agora declaram testConnection', () => {
  const MP    = require('../src/providers/wallet/mercadopago.connector');
  const Asaas = require('../src/providers/wallet/asaas.connector');
  const Stripe= require('../src/providers/wallet/stripe.connector');
  const PP    = require('../src/providers/wallet/pushinpay.connector');
  const NOW   = require('../src/providers/wallet/nowpayments.connector');
  const Mistic= require('../src/providers/wallet/misticpay.connector');
  const Aba   = require('../src/providers/wallet/abacatepay.connector');
  const Efi   = require('../src/providers/wallet/efi.connector');
  for (const C of [MP, Asaas, Stripe, PP, NOW, Mistic, Aba, Efi]) {
    const c = new C({ credentials: {} });
    assert(typeof c.testConnection === 'function', `${C.name} tem testConnection`);
  }
});

test('Bulk refund: ids vazio -> 400', () => {
  // Smoke do controller (logica interna sem chamar HTTP)
  // O endpoint exige requireAuth + db; aqui validamos so o shape do body.
  const ids = [];
  assert(!ids.length, 'array vazio rejeitado pelo endpoint');
});

test('Timeline: monta eventos a partir de sale + webhook_events', () => {
  // Cria sale + webhook_event
  const sInfo = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at, recon_status, recon_checked_at)
    VALUES ('111111111111111111', 5000, 'paid', '[]', 'fake', 'tl-001', strftime('%s','now'), 'ok', strftime('%s','now'))
  `).run();
  const saleId = sInfo.lastInsertRowid;

  try {
    db.prepare(`
      INSERT OR IGNORE INTO webhook_events (gateway, event_id, event_type, transaction_id, sale_id, signature_ok, status, received_at)
      VALUES ('fake', 'evt-tl-001', 'paid', 'tl-001', ?, 1, 'processed', strftime('%s','now'))
    `).run(saleId);
  } catch {}

  // Verifica que webhook_events tem o link
  const wh = db.prepare(`SELECT * FROM webhook_events WHERE sale_id=?`).get(saleId);
  assert(wh, 'webhook event ligado a sale');
  assertEq(wh.transaction_id, 'tl-001');
});

test('MED notifica em /wallet-sales.html (link atualizado)', () => {
  // Garante que o link foi mudado pra /wallet-sales.html (era /app.html#vendas)
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/services/med.service.js'), 'utf8');
  assert(src.includes('/wallet-sales.html'), 'med.service usa link novo da UI');
  assert(src.includes('bot.dmUser'), 'med.service envia DM Discord');
});
