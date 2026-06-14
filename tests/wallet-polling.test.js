// Wallet polling fallback: vendas pending antigas viram paid se o connector
// devolve mapStatus='paid', e expired se 'expired'.

const { db } = require('../src/database/connection');
const { BaseConnector } = require('../src/providers/wallet/base.connector');
const registry = require('../src/providers/wallet');

// Stub bot.service pro fulfillment
const botPath = require.resolve('../src/services/bot.service');
require.cache[botPath] = {
  exports: { dmUser: async () => true, grantRole: async () => true, restart: async () => true }
};

// Connector controlavel — mapStatus por charge_id (evita race entre testes async)
const STATUS_MAP = {};
class PollFake extends BaseConnector {
  constructor() { super({ providerId: 'pollfake', credentials: {} }); }
  static get REQUIRED_CREDS() { return []; }
  async fetchPayment(id) { return { id, status: STATUS_MAP[id] || 'pending' }; }
  mapStatus(p) { return p.status; }
}
registry.CONNECTORS.pollfake = PollFake;

// Registra no catalogo (sem creds obrigatorias = sempre "configurado")
const wallet = require('../src/config/wallet-providers');
wallet.PROVIDERS.pollfake = {
  id: 'pollfake', label: 'PollFake', method: 'pix', country: 'BR',
  credentials: [], sort: 99
};
wallet.PROVIDER_FEATURE.pollfake = null;

const polling = require('../src/jobs/wallet-polling');

const pending = [];
const origTest = global.test;
global.test = function (n, fn) {
  const r = origTest(n, fn);
  if (r && typeof r.then === 'function') pending.push(r);
  return r;
};

test('polling: sale recente (< 10min) eh ignorada', async () => {
  // recente = agora; o job tem stale_after_seconds=600
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, created_at)
    VALUES ('123456789012345678', 1000, 'pending', '[]', 'pollfake', 'poll-fresh', strftime('%s','now'))
  `).run();
  const r = await polling.run();
  const sale = db.prepare(`SELECT status FROM sales WHERE provider_charge_id='poll-fresh'`).get();
  assertEq(sale.status, 'pending', 'sale recente fica pending');
});

test('polling: sale antiga + status=paid na PSP -> fulfillSale', async () => {
  const old = Math.floor(Date.now()/1000) - 900;   // 15min atras
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, created_at)
    VALUES ('123456789012345678', 1000, 'pending', '[]', 'pollfake', 'poll-paid', ?)
  `).run(old);

  STATUS_MAP['poll-paid'] = 'paid';
  const r = await polling.run();
  assert(r.resolved >= 1, 'pelo menos 1 resolvida');
  const sale = db.prepare(`SELECT status, paid_at FROM sales WHERE provider_charge_id='poll-paid'`).get();
  assertEq(sale.status, 'paid');
  assert(sale.paid_at > 0);
});

test('polling: sale antiga + status=expired -> sale expirada', async () => {
  const old = Math.floor(Date.now()/1000) - 900;
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, created_at)
    VALUES ('123456789012345678', 1000, 'pending', '[]', 'pollfake', 'poll-exp', ?)
  `).run(old);

  STATUS_MAP['poll-exp'] = 'expired';
  await polling.run();
  const sale = db.prepare(`SELECT status FROM sales WHERE provider_charge_id='poll-exp'`).get();
  assertEq(sale.status, 'expired');
});

test('polling: sale antiga + status=pending ainda continua pending', async () => {
  const old = Math.floor(Date.now()/1000) - 900;
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, created_at)
    VALUES ('123456789012345678', 1000, 'pending', '[]', 'pollfake', 'poll-still', ?)
  `).run(old);

  STATUS_MAP['poll-still'] = 'pending';
  await polling.run();
  const sale = db.prepare(`SELECT status FROM sales WHERE provider_charge_id='poll-still'`).get();
  assertEq(sale.status, 'pending', 'continua pending pra proxima rodada');
});

test('polling: provider nao configurado vira failed', async () => {
  const old = Math.floor(Date.now()/1000) - 900;
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, created_at)
    VALUES ('123456789012345678', 1000, 'pending', '[]', 'inexistente', 'poll-orphan', ?)
  `).run(old);

  await polling.run();
  const sale = db.prepare(`SELECT status FROM sales WHERE provider_charge_id='poll-orphan'`).get();
  assertEq(sale.status, 'failed', 'sale orfa vira failed');
});

module.exports = Promise.all(pending).then(() => { global.test = origTest; });
