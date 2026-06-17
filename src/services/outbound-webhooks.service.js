// Envia webhooks pros endpoints do vendedor quando algo acontece na sua loja.
//
// Eventos disparados (atualmente):
//   - sale.paid          -> ao confirmar pagamento (fulfillment)
//   - sale.refunded      -> ao reembolsar
//   - sale.med_returned  -> ao MED chegar
//
// Assinatura: HMAC-SHA256(secret, body) no header X-BotDash-Signature: sha256=<hex>
// Tambem inclui X-BotDash-Event e X-BotDash-Delivery (uuid pra dedup).
//
// Retry: tenta 3x com backoff (5s, 30s, 300s) se status != 2xx.
// Disable: 5 falhas consecutivas => active=0, vendedor precisa reativar.

const crypto = require('crypto');
const { db } = require('../database/connection');
const logger = require('../utils/logger');

const TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 32 * 1024;

async function dispatch(event, payload) {
  // user_id no payload identifica o destinatario. Se nao tem, dispara pra
  // todos os endpoints com active=1 e o evento no array events.
  const userIds = payload.user_id ? [payload.user_id] : listAllActiveUsers();
  for (const uid of userIds) {
    const hooks = db.prepare(`
      SELECT * FROM outbound_webhooks
      WHERE user_id = ? AND active = 1
    `).all(uid);
    for (const h of hooks) {
      let events = [];
      try { events = JSON.parse(h.events || '[]'); } catch {}
      if (!events.includes(event) && !events.includes('*')) continue;
      // Filtra por guild se a webhook esta amarrada a guild especifica
      if (h.guild_id && payload.guild_id && h.guild_id !== payload.guild_id) continue;
      await sendOne(h, event, payload).catch(e => logger.warn({ err: e.message }, 'outbound dispatch falhou'));
    }
  }
}

function listAllActiveUsers() {
  return db.prepare(`SELECT DISTINCT user_id FROM outbound_webhooks WHERE active=1`).all().map(r => r.user_id);
}

async function sendOne(hook, event, payload, attemptNumber = 1) {
  const start = Date.now();
  const delivery = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event,
    delivery,
    sent_at: new Date().toISOString(),
    data: payload
  });
  // v1: sha256(body) — legado
  const sigV1 = 'sha256=' + crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
  // v2: sha256(timestamp + '.' + body) — anti-replay (Stripe-style)
  const sigV2 = 't=' + timestamp + ',v2=' + crypto.createHmac('sha256', hook.secret).update(`${timestamp}.${body}`).digest('hex');

  let status = 0, respBody = null, error = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BotDash-Event': event,
        'X-BotDash-Delivery': delivery,
        'X-BotDash-Timestamp': String(timestamp),
        'X-BotDash-Signature': sigV1,            // legado
        'X-BotDash-Signature-V2': sigV2,         // recomendado (anti-replay)
        'User-Agent': 'BotDash-Webhook/2.0'
      },
      body,
      signal: ctrl.signal
    });
    clearTimeout(timer);
    status = r.status;
    try {
      const txt = await r.text();
      respBody = txt.slice(0, 500);
    } catch {}
  } catch (e) {
    error = e.message || String(e);
  }
  const duration = Date.now() - start;
  const succeeded = status >= 200 && status < 300;

  try {
    db.prepare(`
      INSERT INTO outbound_webhook_attempts
        (webhook_id, event, payload, status_code, response_body, error, attempt_number, succeeded, duration_ms)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      hook.id, event,
      body.length > MAX_BODY_BYTES ? body.slice(0, MAX_BODY_BYTES) : body,
      status || null, respBody, error, attemptNumber, succeeded ? 1 : 0, duration
    );
    try { require('./metrics.service').inc('botdash_webhook_outbound_total', { event, status: succeeded ? 'ok' : 'fail' }); } catch {}

    if (succeeded) {
      db.prepare(`UPDATE outbound_webhooks SET failure_count=0, last_success_at=strftime('%s','now'), last_attempt_at=strftime('%s','now') WHERE id=?`).run(hook.id);
    } else {
      const upd = db.prepare(`
        UPDATE outbound_webhooks
        SET failure_count = failure_count + 1,
            last_attempt_at = strftime('%s','now'),
            active = CASE WHEN failure_count + 1 >= 5 THEN 0 ELSE active END,
            disabled_at = CASE WHEN failure_count + 1 >= 5 THEN strftime('%s','now') ELSE disabled_at END
        WHERE id = ?
      `);
      upd.run(hook.id);
    }
  } catch (e) { logger.warn({ err: e.message }, 'outbound persist falhou'); }

  return { delivery, succeeded, status, duration };
}

// Resend manual: util pro vendedor reenviar quando endpoint dele estava fora
async function resend(attemptId, userId) {
  const att = db.prepare(`
    SELECT a.*, w.user_id AS owner_id, w.url, w.secret, w.id AS hook_id
    FROM outbound_webhook_attempts a
    JOIN outbound_webhooks w ON w.id = a.webhook_id
    WHERE a.id = ?
  `).get(attemptId);
  if (!att) throw Object.assign(new Error('attempt nao encontrado'), { code: 'not_found' });
  if (att.owner_id !== userId) throw Object.assign(new Error('forbidden'), { code: 'forbidden' });

  let original = {};
  try { original = JSON.parse(att.payload); } catch {}
  return sendOne({ id: att.hook_id, url: att.url, secret: att.secret }, att.event, original.data || {});
}

module.exports = { dispatch, sendOne, resend };
