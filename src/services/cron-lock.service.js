// Lock cooperativo pra jobs distribuidos. Padrao single-replica eh no-op;
// pra multi-replica garante exclusao mutua via INSERT OR IGNORE + lease.
//
// Uso:
//   const ok = lock.acquire('wallet-polling', 120);
//   if (!ok) return;       // outra replica esta executando
//   try { await run(); } finally { lock.release('wallet-polling'); }
//
// Lease evita orfaos: se holder crashar, lock expira automaticamente.

const os = require('os');
const { db } = require('../database/connection');

const HOLDER = `${os.hostname()}/${process.pid}`;

function now() { return Math.floor(Date.now() / 1000); }

function acquire(jobName, leaseSeconds = 120) {
  const expiresAt = now() + leaseSeconds;
  try {
    // Tenta INSERT (sucesso = primeiro a pegar)
    const r = db.prepare(`
      INSERT INTO cron_locks (job_name, holder, acquired_at, lease_until)
      VALUES (?, ?, ?, ?)
    `).run(jobName, HOLDER, now(), expiresAt);
    if (r.changes > 0) return true;
  } catch (e) {
    // PRIMARY KEY ja existe — lock contido. Tenta tomar se expirou.
  }

  // Lock existente: tomamos se expirou OU se somos o holder atual (re-entrant)
  const r = db.prepare(`
    UPDATE cron_locks
       SET holder = ?, acquired_at = ?, lease_until = ?
     WHERE job_name = ?
       AND (lease_until < ? OR holder = ?)
  `).run(HOLDER, now(), expiresAt, jobName, now(), HOLDER);
  return r.changes > 0;
}

function release(jobName) {
  try {
    db.prepare(`DELETE FROM cron_locks WHERE job_name = ? AND holder = ?`).run(jobName, HOLDER);
  } catch {}
}

// Helper de uso pratico: wrappa um async fn com lock
async function withLock(jobName, leaseSeconds, fn) {
  if (!acquire(jobName, leaseSeconds)) return { skipped: true, reason: 'lock_held' };
  try {
    const r = await fn();
    return { skipped: false, result: r };
  } finally {
    release(jobName);
  }
}

module.exports = { acquire, release, withLock, HOLDER };
