// Webhook DLQ — Dead Letter Queue com retry exponencial.
// Quando webhook_events.status = 'failed', envia pra fila de retry.
// Backoff: 1m, 5m, 15m, 1h, 6h (5 tentativas total).

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];

function enqueue(webhookEventId, gateway, errorMsg) {
  const now = Math.floor(Date.now() / 1000);
  const existing = db.prepare(`SELECT id, attempts FROM webhook_dlq WHERE webhook_event_id=?`).get(webhookEventId);
  if (existing) {
    const attempts = existing.attempts + 1;
    const backoff = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)];
    const status = attempts >= BACKOFF_SECONDS.length ? 'exhausted' : 'pending';
    db.prepare(`
      UPDATE webhook_dlq SET attempts=?, next_attempt_at=?, last_error=?, status=?, updated_at=strftime('%s','now') WHERE id=?
    `).run(attempts, now + backoff, String(errorMsg || '').slice(0, 500), status, existing.id);
    return { id: existing.id, attempts, status };
  }
  const info = db.prepare(`
    INSERT INTO webhook_dlq (webhook_event_id, gateway, attempts, next_attempt_at, last_error)
    VALUES (?, ?, 0, ?, ?)
  `).run(webhookEventId, gateway, now + BACKOFF_SECONDS[0], String(errorMsg || '').slice(0, 500));
  return { id: info.lastInsertRowid, attempts: 0, status: 'pending' };
}

function markSucceeded(dlqId) {
  db.prepare(`UPDATE webhook_dlq SET status='succeeded', updated_at=strftime('%s','now') WHERE id=?`).run(dlqId);
}

// Drena DLQ — pega proximos eventos elegiveis e retenta
async function drain(maxBatch = 20) {
  const now = Math.floor(Date.now() / 1000);
  const candidates = db.prepare(`
    SELECT d.*, we.gateway AS we_gateway, we.event_id, we.transaction_id, we.payload
    FROM webhook_dlq d
    JOIN webhook_events we ON we.id = d.webhook_event_id
    WHERE d.status = 'pending' AND d.next_attempt_at <= ?
    ORDER BY d.next_attempt_at ASC LIMIT ?
  `).all(now, maxBatch);

  let processed = 0, succeeded = 0, failed = 0;
  for (const c of candidates) {
    processed++;
    try {
      let payload;
      try { payload = JSON.parse(c.payload || '{}'); } catch { payload = {}; }
      if (c.we_gateway === 'misticpay') {
        const result = await retryMisticPay(c, payload);
        if (result.ok) {
          markSucceeded(c.id);
          succeeded++;
        } else {
          enqueue(c.webhook_event_id, c.we_gateway, result.error || 'retry falhou');
          failed++;
        }
      } else {
        // Outros gateways: marca exhausted (nao temos retry impl)
        db.prepare(`UPDATE webhook_dlq SET status='exhausted', last_error='no retry handler' WHERE id=?`).run(c.id);
        failed++;
      }
    } catch (e) {
      enqueue(c.webhook_event_id, c.we_gateway, e.message);
      failed++;
    }
  }
  if (processed > 0) logger.info({ processed, succeeded, failed }, 'webhook DLQ drain');
  return { processed, succeeded, failed };
}

async function retryMisticPay(dlqRow, payload) {
  const mp = require('./misticpay.service');
  const txId = payload.transactionId || payload.id || dlqRow.transaction_id;
  if (!txId) return { ok: false, error: 'no transactionId' };

  const sale = db.prepare(`SELECT * FROM sales WHERE stripe_session_id=?`).get('mp:' + txId);
  if (!sale) return { ok: false, error: 'sale nao encontrada' };
  if (sale.status === 'paid') return { ok: true };

  try {
    const remote = await mp.getTransaction(txId);
    const status = (remote.status || '').toUpperCase();
    if (['APROVADO', 'APPROVED', 'PAID', 'PAGO'].includes(status)) {
      const ctrl = require('../controllers/checkout_misticpay.controller');
      if (ctrl._markPaid) {
        await ctrl._markPaid(sale, txId);
        return { ok: true };
      }
    }
    return { ok: false, error: 'status remoto ainda nao aprovado: ' + status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { enqueue, drain, markSucceeded, BACKOFF_SECONDS };
