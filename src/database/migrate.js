// Runner de migrations. Aplica .sql de database/migrations/ em ordem,
// pulando ja aplicados (tabela _migrations). Tolera 'duplicate column'
// em ALTER TABLE ADD COLUMN (esperado se a coluna ja foi criada por
// ensureColumn no codigo antigo).
const fs = require('fs');
const path = require('path');
const { db } = require('./connection');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'database', 'migrations');

const IGNORABLE_ERRORS = [
  /duplicate column name/i,
  /already exists/i
];

function isIgnorable(err) {
  return IGNORABLE_ERRORS.some(re => re.test(err.message));
}

function splitStatements(sql) {
  // Remove comentarios de linha (-- ...) e separa por ;
  // Tolerante a multi-linha (CREATE TABLE com varias colunas)
  const cleaned = sql
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n');
  return cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function applyMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn({ dir: MIGRATIONS_DIR }, 'pasta de migrations nao encontrada');
    return;
  }

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
    const statements = splitStatements(sql);

    let failed = 0;
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (e) {
        if (isIgnorable(e)) continue;
        logger.error({ err: e.message, file, stmt: stmt.slice(0, 100) }, 'erro em statement');
        failed++;
        throw e;
      }
    }

    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    logger.info({ file, statements: statements.length }, 'migration aplicada');
    count++;
  }
  if (count === 0) logger.debug('nenhuma migration nova');
}

module.exports = { applyMigrations };

if (require.main === module) {
  applyMigrations();
  console.log('migrations OK');
}
