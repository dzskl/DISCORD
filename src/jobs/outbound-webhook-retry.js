// Retry inteligente pros outbound_webhook_attempts que falharam.
//
// Politica de retry (backoff exponencial):
//   - attempt 1 (original): falhou → marca pra retry
//   - retry +30s  (attempt 2)
//   - retry +5min (attempt 3)
//   - retry +1h   (attempt 4)
//   - retry +6h   (attempt 5)
//   - apos 5 tentativas: para. Webhook ja foi desativado em 5 falhas
//     consecutivas (na service), mas pode ter mais attempts orfas.
//
// Roda a cada 5min. Pega attempts succeeded=0 com idade especifica e
// reenviam usando obService.sendOne (que cria nova attempt no banco).

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const SCHEDULE = [
  // [min_age_seconds, max_age_seconds, attempt_number_to_retry]
  [30,       300,      2],    // 30s..5min -> attempt #2
  [300,      3600,     3],    // 5min..1h  -> attempt #3
  [3600,     21600,    4],    // 1h..6h    -> attempt #4
  [21600,    172800,   5]     // 6h..48h   -> attempt #5 (max)
];

async function run() {
  const now = Math.floor(Date.now() / 1000);
  let retried = 0;
  const obService = require('../services/outbound-webhooks.service');

  // Pra cada janela do schedule, busca attempts elegiveis
  for (const [minAge, maxAge, attemptNum] of SCHEDULE) {
    // attempts originais falhadas (succeeded=0) que ainda nao foram retentadas
    // nesse nivel (nao existe outra attempt com attempt_number=attemptNum
    // pro mesmo webhook+event+delivery)
    const rows = db.prepare(`
      SELECT a.id, a.webhook_id, a.event, a.payload, a.attempt_number,
             w.url, w.secret, w.active
      FROM outbound_webhook_attempts a
      JOIN outbound_webhooks w ON w.id = a.webhook_id
      WHERE a.succeeded = 0
        AND a.attempt_number = ?
        AND a.created_at <= ?
        AND a.created_at > ?
        AND w.active = 1
        AND NOT EXISTS (
          SELECT 1 FROM outbound_webhook_attempts a2
          WHERE a2.webhook_id = a.webhook_id
            AND a2.event = a.event
            AND a2.attempt_number = ?
        )
      LIMIT 50
    `).all(attemptNum - 1, now - minAge, now - maxAge, attemptNum);

    for (const row of rows) {
      try {
        let payload = {};
        try { payload = JSON.parse(row.payload || '{}'); } catch {}
        const data = payload.data || {};
        await obService.sendOne(
          { id: row.webhook_id, url: row.url, secret: row.secret },
          row.event,
          data,
          attemptNum
        );
        retried++;
      } catch (e) {
        logger.warn({ err: e.message, webhook_id: row.webhook_id }, 'outbound retry falhou');
      }
    }
  }

  return { retried };
}

module.exports = { run, SCHEDULE };
