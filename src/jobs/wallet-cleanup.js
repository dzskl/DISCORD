// Cleanup de tabelas que crescem sem limite:
//   - webhook_events: eventos PSP recebidos. Mantem 30d. Idempotencia
//     ja deixou de ser util depois disso (PSP nao re-envia eventos antigos).
//   - outbound_webhook_attempts: tentativas que ja sao historico apos 30d.
//   - api_key_audit: log de acesso. Mantem 90d.
//
// Roda 1x por dia (cron 30 3 * * *).

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const WEBHOOK_EVENTS_RETENTION_DAYS  = 30;
const OUTBOUND_ATTEMPTS_RETENTION    = 30;
const API_KEY_AUDIT_RETENTION        = 90;

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const stats = {};

  // webhook_events
  try {
    const cutoff = now - WEBHOOK_EVENTS_RETENTION_DAYS * 86400;
    const r = db.prepare(`DELETE FROM webhook_events WHERE received_at < ?`).run(cutoff);
    stats.webhook_events_deleted = r.changes;
  } catch (e) { logger.warn({ err: e.message }, 'cleanup webhook_events falhou'); }

  // outbound_webhook_attempts
  try {
    const cutoff = now - OUTBOUND_ATTEMPTS_RETENTION * 86400;
    const r = db.prepare(`DELETE FROM outbound_webhook_attempts WHERE created_at < ?`).run(cutoff);
    stats.outbound_attempts_deleted = r.changes;
  } catch (e) { logger.warn({ err: e.message }, 'cleanup outbound_attempts falhou'); }

  // api_key_audit
  try {
    const cutoff = now - API_KEY_AUDIT_RETENTION * 86400;
    const r = db.prepare(`DELETE FROM api_key_audit WHERE created_at < ?`).run(cutoff);
    stats.api_key_audit_deleted = r.changes;
  } catch (e) { logger.warn({ err: e.message }, 'cleanup api_key_audit falhou'); }

  // idempotency_keys: usa expires_at proprio (24h)
  try {
    const { cleanupExpired } = require('../middlewares/idempotency.middleware');
    stats.idempotency_keys_deleted = cleanupExpired();
  } catch (e) { logger.warn({ err: e.message }, 'cleanup idempotency falhou'); }

  // VACUUM pra recuperar espaco (apenas se algo foi deletado)
  const total = Object.values(stats).reduce((a, n) => a + (n || 0), 0);
  if (total > 1000) {
    try { db.exec('VACUUM'); stats.vacuum = true; } catch {}
  }

  return stats;
}

module.exports = { run };
