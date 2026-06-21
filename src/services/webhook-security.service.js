// Validacao de assinatura HMAC + idempotencia centralizada.
// Funciona com MysticPay (header x-signature) e generico.
//
// Modelo padrao: HMAC-SHA256(rawBody, secret) em hex.
// O secret vem de getCredential('MISTICPAY_WEBHOOK_SECRET').
//
// Se o secret nao estiver configurado o webhook ainda eh aceito (modo "open"
// pra setup inicial), mas signature_ok eh marcado como NULL pra alerta.

const crypto = require('crypto');
const { db, getCredential } = require('../database/connection');

function timingSafeEq(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Calcula HMAC-SHA256 hex
function sign(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Valida assinatura. Retorna { ok: bool, present: bool }.
function verifyMisticPaySignature(rawBody, signatureHeader) {
  const secret = getCredential('MISTICPAY_WEBHOOK_SECRET');
  if (!secret) return { ok: null, present: !!signatureHeader }; // sem secret: modo open
  if (!signatureHeader) return { ok: false, present: false };
  const expected = sign(rawBody, secret);
  // Aceita "sha256=xxx" ou "xxx" direto
  const sig = String(signatureHeader).replace(/^sha256=/i, '').trim();
  return { ok: timingSafeEq(expected, sig), present: true };
}

// Extrai event_id do payload com fallbacks por campo comum.
// Se nao tiver event_id no payload, gera fingerprint do conteudo bruto.
function extractEventId(gateway, payload, rawBody) {
  return (
    payload?.event_id ||
    payload?.id ||
    payload?.eventId ||
    payload?.webhook_id ||
    (payload?.transactionId && payload?.status ? `${payload.transactionId}:${payload.status}` : null) ||
    crypto.createHash('sha256').update(String(rawBody || JSON.stringify(payload || {}))).digest('hex').slice(0, 32)
  );
}

// Registra o evento. Retorna { id, duplicate } onde duplicate=true se ja
// foi processado antes. Use o id pra marcar processed/failed depois.
function recordEvent({ gateway, event_id, event_type, transaction_id, payload, signature_ok }) {
  try {
    const info = db.prepare(`
      INSERT INTO webhook_events (gateway, event_id, event_type, transaction_id, payload, signature_ok, status)
      VALUES (?, ?, ?, ?, ?, ?, 'received')
    `).run(
      gateway,
      String(event_id),
      event_type || null,
      transaction_id || null,
      typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
      signature_ok === null ? null : (signature_ok ? 1 : 0)
    );
    return { id: info.lastInsertRowid, duplicate: false };
  } catch (e) {
    // UNIQUE violation = duplicado
    if (/UNIQUE/i.test(e.message)) {
      const existing = db.prepare(`SELECT id FROM webhook_events WHERE gateway=? AND event_id=?`)
        .get(gateway, String(event_id));
      return { id: existing?.id, duplicate: true };
    }
    throw e;
  }
}

function markProcessed(id, sale_id) {
  db.prepare(`UPDATE webhook_events SET status='processed', processed_at=strftime('%s','now'), sale_id=? WHERE id=?`)
    .run(sale_id || null, id);
}

function markFailed(id, errMsg) {
  db.prepare(`UPDATE webhook_events SET status='failed', processed_at=strftime('%s','now'), error=? WHERE id=?`)
    .run(String(errMsg || 'unknown').slice(0, 500), id);
}

module.exports = {
  sign,
  verifyMisticPaySignature,
  extractEventId,
  recordEvent,
  markProcessed,
  markFailed
};
