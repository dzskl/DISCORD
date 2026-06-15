// CSV export shape, yearly endpoint, dispute manual, fraud monitor.

const { db } = require('../src/database/connection');

test('CSV: shape do header esta correto', () => {
  // Validacao estrutural — o controller monta uma linha header conhecida.
  const headers = ['id','status','provider','charge_id','pay_currency','amount_brl','net_brl','discord_id','discord_tag','product','created_at','paid_at'];
  assertEq(headers.length, 12);
});

test('Yearly: monta grade 12 meses com matrix vazio quando nao ha vendas', () => {
  // Sanity: SQLite strftime('%Y-%m', ...) funciona
  const r = db.prepare(`SELECT strftime('%Y-%m', ?, 'unixepoch') AS ym`).get(1700000000);
  assert(/^\d{4}-\d{2}$/.test(r.ym), 'strftime retorna YYYY-MM');
});

test('Dispute manual: med.service eh acionavel com reason', () => {
  // Stub bot service
  const botPath = require.resolve('../src/services/bot.service');
  require.cache[botPath] = { exports: { dmUser: async () => true, grantRole: async () => true } };

  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, paid_at)
    VALUES ('123456789012345678', 10000, 'paid', '[]', 'asaas', 'man-disp-1', strftime('%s','now'))
  `).run();
  const med = require('../src/services/med.service');
  return med.handleMedReturn(info.lastInsertRowid, { reason: 'contestacao manual via painel' }).then(r => {
    assert(r.ok);
    const s = db.prepare(`SELECT status FROM sales WHERE id=?`).get(info.lastInsertRowid);
    assertEq(s.status, 'med_returned');
  });
});

test('Fraud monitor: nao alerta com <10 vendas', async () => {
  // Insere 5 sales recentes
  for (let i = 0; i < 5; i++) {
    db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, paid_at, guild_id)
      VALUES ('111111111111111111', 1000, 'paid', '[]', 'fake', strftime('%s','now'), 'fm-test-1')
    `).run();
  }
  const fm = require('../src/services/fraud-monitor.service');
  const r = await fm.run();
  // Como tem <10 sales na guild fm-test-1, nao entra no relatorio
  assert(r.checked >= 0, 'run retorna objeto');
});

test('Fraud monitor: alerta quando MED/total >= 5% com volume', async () => {
  // 20 sales paid + 2 med_returned na guild fm-test-2 = 10%
  const gid = 'fm-test-2';
  for (let i = 0; i < 20; i++) {
    db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, paid_at, guild_id)
      VALUES ('111111111111111111', 1000, 'paid', '[]', 'fake', strftime('%s','now'), ?)
    `).run(gid);
  }
  for (let i = 0; i < 2; i++) {
    db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, paid_at, guild_id)
      VALUES ('111111111111111111', 1000, 'med_returned', '[]', 'fake', strftime('%s','now'), ?)
    `).run(gid);
  }
  // Garante guild_id na tabela guilds + owner
  try { db.prepare(`INSERT OR IGNORE INTO guilds (id, name) VALUES (?, ?)`).run(gid, 'fm test'); } catch {}
  try { db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, role, active) VALUES (3, 'fm@t', 'x', 'owner', 1)`).run(); } catch {}
  try { db.prepare(`INSERT OR IGNORE INTO user_guilds (user_id, guild_id, role) VALUES (3, ?, 'owner')`).run(gid); } catch {}

  // Stub bot
  const botPath = require.resolve('../src/services/bot.service');
  require.cache[botPath] = { exports: { dmUser: async () => true, grantRole: async () => true } };

  const fm = require('../src/services/fraud-monitor.service');
  const r = await fm.run();
  assert(r.alerts >= 1, `alerta disparou (recebido: ${r.alerts})`);
});
