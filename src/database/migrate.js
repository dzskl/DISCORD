// Runner de migrations. Aplica arquivos .sql de database/migrations/ na ordem
// alfabetica, pulando os ja aplicados (registrados em _migrations).
const fs = require('fs');
const path = require('path');
const { db } = require('./connection');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'database', 'migrations');

function applyMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn({ dir: MIGRATIONS_DIR }, 'pasta de migrations nao encontrada');
    return;
  }

  // garante a tabela de tracking
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );`);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      logger.info({ file }, 'migration aplicada');
      count++;
    } catch (e) {
      logger.error({ err: e.message, file }, 'erro aplicando migration');
      throw e;
    }
  }
  if (count === 0) logger.debug('nenhuma migration nova');
}

module.exports = { applyMigrations };

if (require.main === module) {
  applyMigrations();
  console.log('migrations OK');
}
