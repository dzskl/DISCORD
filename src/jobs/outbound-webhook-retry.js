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

// Backoff exponencial puro: 30s, 2min, 8min, 32min, 2h, 8h
// (cada nivel = 4x o anterior). Janela do schedule abre quando idade
// >= min_age + jitter aleatorio de ate 30% pra evitar thundering herd.
const SCHEDULE = [
  // [min_age_seconds, max_age_seconds, attempt_number_to_retry]
  [30,       300,      2],    // 30s..5min   -> attempt #2
  [120,      900,      3],    // 2min..15min -> attempt #3
  [480,      3600,     4],    // 8min..1h    -> attempt #4
  [1920,     21600,    5]     // 32min..6h   -> attempt #5 (max)
];

// Jitter aleatorio adicionado ao min_age (0..30%) pra cada attempt
// — calculado por (webhook_id + attemptNum) hash pra ser deterministico
// por hook, evitando que retries de hooks distintos sincronizem.
function jitterOffset(webhookId, attemptNum) {
  const seed = (webhookId * 31 + attemptNum) % 1000;
  return Math.floor((seed / 1000) * 30);   // 0..30 segundos extra
}

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
      // Jitter por hook: pula se ainda nao deu o offset adicional desse hook
      const offset = jitterOffset(row.webhook_id, attemptNum);
      const ageNow = now - (row.created_at || 0);
      // Espera: ja passou (minAge + jitter)?
      if (ageNow < minAge + offset) continue;

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

module.exports = { run, SCHEDULE, jitterOffset };
