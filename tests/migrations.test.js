// Smoke test: migrations aplicam limpo do zero e criam todas as tabelas esperadas.

const { applyMigrations } = require('../src/database/migrate');
const { db } = require('../src/database/connection');

test('aplica migrations sem erro', () => {
  applyMigrations();
});

test('cria tabelas core', () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['users', 'products', 'sales', 'guilds', 'user_guilds', 'guild_config', '_migrations']) {
    assert(names.includes(t), `tabela ${t} faltando`);
  }
});

test('guild_id existe em products', () => {
  const cols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
  assert(cols.includes('guild_id'), 'products.guild_id faltando');
});

test('idempotente — re-aplicar nao quebra', () => {
  applyMigrations();
});
