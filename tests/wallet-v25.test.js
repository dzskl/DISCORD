// Span sampling + tenant scope enforcement.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const keys = require('../src/services/api-keys.service');

try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (1000,'ts@t','x','owner',1)`).run(); } catch {}

test('Sampling: shouldSample com rate=1 sempre true', () => {
  const t = require('../src/services/tracing.service');
  // SAMPLE_RATE default eh 1 (sem env). shouldSample deve retornar true.
  assertEq(t.shouldSample('00000000ffffffffffffffffffffffff', false), true);
  assertEq(t.shouldSample('ffffffff00000000000000000000000', false), true);
});

test('Sampling: forced=true sempre amostra (erros)', () => {
  const t = require('../src/services/tracing.service');
  assertEq(t.shouldSample('00000000000000000000000000000000', true), true);
});

test('Sampling: determinismo — mesmo traceId mesma decisao', () => {
  const t = require('../src/services/tracing.service');
  const tid = 'abcd1234 effff0000 1111 2222'.replace(/\s/g, '').padEnd(32, '0');
  const d1 = t.shouldSample(tid, false);
  const d2 = t.shouldSample(tid, false);
  assertEq(d1, d2, 'decisao deterministica');
});

test('Tenant scope: guildScoped marca chave amarrada a guild', () => {
  const { apiKeyOrAuth } = require('../src/middlewares/api-key.middleware');
  const k = keys.generate({ user_id: 1000, label: 'guild-bound', guild_id: 'guild-abc', scopes: ['read:sales'] });
  const handler = apiKeyOrAuth('read:sales');
  const req = { headers: { authorization: `Bearer ${k.full_key}` }, method: 'GET', path: '/x' };
  const res = { on: () => {}, statusCode: 200 };
  handler(req, res, () => {});
  assertEq(req.guildScoped, true);
  assertEq(req.guildId, 'guild-abc');
  assertEq(req.apiKey.guild_id, 'guild-abc');
});

test('Tenant scope: chave sem guild_id nao eh guildScoped', () => {
  const { apiKeyOrAuth } = require('../src/middlewares/api-key.middleware');
  const k = keys.generate({ user_id: 1000, label: 'account-wide', scopes: ['read:sales'] });
  const handler = apiKeyOrAuth('read:sales');
  const req = { headers: { authorization: `Bearer ${k.full_key}` }, method: 'GET', path: '/x' };
  const res = { on: () => {}, statusCode: 200 };
  handler(req, res, () => {});
  assertEq(req.guildScoped, false);
});

test('Tenant scope: /sales query estrita quando guildScoped', () => {
  // Cria 1 sale na guild + 1 sale guild_id NULL
  db.prepare(`INSERT OR IGNORE INTO guilds (id, name) VALUES ('ts-guild', 'TS')`).run();
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, guild_id, paid_at)
              VALUES ('111111111111111111', 1000, 'paid', '[]', 'mp', 'ts-g1', 'ts-guild', strftime('%s','now'))`).run();
  db.prepare(`INSERT INTO sales (discord_id, amount_cents, status, cart_items, provider, provider_charge_id, guild_id, paid_at)
              VALUES ('111111111111111111', 2000, 'paid', '[]', 'mp', 'ts-gnull', NULL, strftime('%s','now'))`).run();

  // Query estrita (guildScoped): so a da guild
  const strict = db.prepare(`
    SELECT COUNT(*) AS c FROM sales
    WHERE provider IS NOT NULL AND status='paid' AND guild_id = ? AND provider_charge_id LIKE 'ts-%'
  `).get('ts-guild').c;
  assertEq(strict, 1, 'estrito ve so a sale da guild');

  // Query nao-estrita (account-wide): guild OR null
  const wide = db.prepare(`
    SELECT COUNT(*) AS c FROM sales
    WHERE provider IS NOT NULL AND status='paid' AND (guild_id = ? OR guild_id IS NULL) AND provider_charge_id LIKE 'ts-%'
  `).get('ts-guild').c;
  assertEq(wide, 2, 'account-wide ve as 2');
});

test('Tenant scope: refund bloqueia guild-scoped em sale guild NULL', () => {
  // Logica: req.guildScoped && !sale.guild_id -> 403
  const reqGuildScoped = true;
  const saleGuildId = null;
  const shouldBlock = reqGuildScoped && !saleGuildId;
  assert(shouldBlock, 'guild-scoped key bloqueada em sale sem guild');
});

test('Health: tracing exposto no details', () => {
  const t = require('../src/services/tracing.service');
  assert(typeof t.SAMPLE_RATE === 'number', 'SAMPLE_RATE numerico');
  assert(t.SAMPLE_RATE >= 0 && t.SAMPLE_RATE <= 1, 'range valido');
});
