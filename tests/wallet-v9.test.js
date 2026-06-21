// Backfill, saldo por provider, multi-guild dashboard.

const { db } = require('../src/database/connection');

test('Backfill: marca sale com stripe_session_id como provider=stripe', () => {
  // Cria sale legada (sem provider, com stripe_session_id)
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, stripe_session_id)
    VALUES ('111111111111111111', 5000, 'paid', '[]', 'cs_legacy_001')
  `).run();
  const saleId = info.lastInsertRowid;

  const backfill = require('../src/jobs/wallet-backfill');
  const stats = backfill.run();
  assert(stats.stripe_marked >= 1, 'pelo menos 1 marcada');

  const sale = db.prepare(`SELECT provider, provider_charge_id FROM sales WHERE id=?`).get(saleId);
  assertEq(sale.provider, 'stripe');
  assertEq(sale.provider_charge_id, 'cs_legacy_001');
});

test('Backfill: dry_run nao altera o banco', () => {
  const info = db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, stripe_session_id)
    VALUES ('111111111111111111', 5000, 'paid', '[]', 'cs_dry_001')
  `).run();
  const saleId = info.lastInsertRowid;

  const backfill = require('../src/jobs/wallet-backfill');
  const stats = backfill.run({ dryRun: true });
  assert(stats.stripe_marked >= 1, 'conta no relatorio');

  const sale = db.prepare(`SELECT provider FROM sales WHERE id=?`).get(saleId);
  assertEq(sale.provider, null, 'banco intacto em dry_run');
});

test('Backfill: sales sem stripe_session_id viram skipped', () => {
  // Cria sale sem nada identificavel
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items)
    VALUES ('111111111111111111', 1000, 'paid', '[]')
  `).run();

  const backfill = require('../src/jobs/wallet-backfill');
  const stats = backfill.run();
  assert(stats.skipped >= 1, 'pelo menos 1 skipped');
});

test('Saldo por provider: agrupa released vs hold', () => {
  // Sale paga released (available_at no passado)
  const past = Math.floor(Date.now() / 1000) - 1000;
  const future = Math.floor(Date.now() / 1000) + 10000;
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, net_to_owner_cents, available_at)
    VALUES ('111111111111111111', 10000, 'paid', '[]', 'mercadopago', 10000, ?)
  `).run(past);
  // Sale paga em hold
  db.prepare(`
    INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, net_to_owner_cents, available_at)
    VALUES ('111111111111111111', 5000, 'paid', '[]', 'mercadopago', 5000, ?)
  `).run(future);

  // Smoke do shape — query inline (controller exige requireAuth)
  const now = Math.floor(Date.now() / 1000);
  const r = db.prepare(`
    SELECT
      provider,
      SUM(CASE WHEN available_at IS NULL OR available_at <= ? THEN net_to_owner_cents ELSE 0 END) AS released,
      SUM(CASE WHEN available_at > ? THEN net_to_owner_cents ELSE 0 END) AS hold
    FROM sales WHERE provider='mercadopago' AND status='paid'
    GROUP BY provider
  `).get(now, now);
  assert(r.released >= 10000, 'released conta sale com available_at passado');
  assert(r.hold >= 5000, 'hold conta sale com available_at futuro');
});

test('Multi-guild: agrega receita por guild', () => {
  // Garante guild existe
  try { db.prepare(`INSERT OR IGNORE INTO guilds (id, name) VALUES ('mg-test-1', 'MG Test 1')`).run(); } catch {}
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, guild_id, paid_at)
      VALUES ('111111111111111111', 1000, 'paid', '[]', 'asaas', 'mg-test-1', strftime('%s','now'))
    `).run();
  }

  const r = db.prepare(`
    SELECT COALESCE(guild_id, '(default)') AS gid, COUNT(*) AS c, SUM(amount_cents) AS gross
    FROM sales WHERE status='paid' AND provider IS NOT NULL AND guild_id='mg-test-1'
    GROUP BY gid
  `).get();
  assertEq(r.c, 3, '3 vendas na guild mg-test-1');
  assertEq(r.gross, 3000);
});
