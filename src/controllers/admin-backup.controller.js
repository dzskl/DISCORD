// Backup do DB pra download. Usa VACUUM INTO pra snapshot consistente
// (better-sqlite3 nativo). Stream do arquivo + cleanup automatico.

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { db } = require('../database/connection');
const { requireOwner } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireOwner);

// POST /api/admin/backup — gera snapshot e retorna pra download
router.post('/', async (req, res) => {
  const tmpFile = path.join(os.tmpdir(), `botdash-backup-${Date.now()}.sqlite`);
  try {
    // VACUUM INTO faz snapshot consistente sem trancar (BEGIN IMMEDIATE interno)
    db.prepare(`VACUUM INTO ?`).run(tmpFile);
    const stat = fs.statSync(tmpFile);

    audit.log({ req, action: 'admin.backup', details: { size_bytes: stat.size } });
    logger.info({ size_bytes: stat.size, file: tmpFile }, 'backup criado');

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="botdash-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite"`);

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('close', () => {
      try { fs.unlinkSync(tmpFile); } catch {}
    });
    stream.on('error', (e) => {
      logger.error({ err: e.message }, 'erro streaming backup');
      try { fs.unlinkSync(tmpFile); } catch {}
    });
  } catch (e) {
    logger.error({ err: e.message }, 'backup falhou');
    try { fs.unlinkSync(tmpFile); } catch {}
    res.status(500).json({ error: 'backup falhou: ' + e.message });
  }
});

// GET /api/admin/backup/info — info sobre o DB sem fazer backup
router.get('/info', (req, res) => {
  try {
    const dbPath = process.env.DATABASE_FILE || process.env.DB_PATH || 'botdash.sqlite';
    const stats = {};
    try { stats.size_bytes = fs.statSync(dbPath).size; } catch {}
    try { stats.tables = db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'`).get().c; } catch {}
    try { stats.migrations = db.prepare(`SELECT COUNT(*) AS c FROM _migrations`).get().c; } catch {}
    try { stats.sales = db.prepare(`SELECT COUNT(*) AS c FROM sales`).get().c; } catch {}
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
