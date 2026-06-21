#!/usr/bin/env node
// Backup do SQLite — usa o online backup API (nao bloqueia writes).
// Gera arquivo .bak no /data/backups/ com timestamp.
// Se BACKUP_S3_URL for set, sobe pra S3 com AWS CLI (opcional).
//
// Uso: node scripts/backup.js
// Cron sugerido em prod: */60 * * * * node scripts/backup.js

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_FILE || process.env.DB_PATH ||
  path.join(__dirname, '..', 'data', 'botdash.sqlite');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const KEEP_LAST = parseInt(process.env.BACKUP_KEEP_LAST) || 24; // 24 backups (24h se 1/h)

function ts() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('DB nao encontrado:', DB_PATH);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dest = path.join(BACKUP_DIR, `botdash-${ts()}.sqlite`);
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  try {
    await db.backup(dest);
    const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
    console.log(`✓ backup gerado: ${dest} (${size} MB)`);

    // Rotaciona — mantem os ultimos N
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('botdash-') && f.endsWith('.sqlite'))
      .map(f => ({ name: f, full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const toDelete = files.slice(KEEP_LAST);
    for (const f of toDelete) {
      fs.unlinkSync(f.full);
      console.log(`  rotacionado: ${f.name}`);
    }

    // Upload S3 opcional (precisa de aws cli configurado)
    if (process.env.BACKUP_S3_URL) {
      const { execSync } = require('child_process');
      try {
        execSync(`aws s3 cp "${dest}" "${process.env.BACKUP_S3_URL}/"`, { stdio: 'inherit' });
        console.log('✓ upload S3 ok');
      } catch (e) {
        console.error('upload S3 falhou:', e.message);
      }
    }
  } finally {
    db.close();
  }
}

main().catch(e => { console.error('backup falhou:', e.message); process.exit(1); });
