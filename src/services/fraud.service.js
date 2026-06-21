// Anti-fraude: heuristicas pra detectar comprador suspeito.
// Sinais coletados: idade da conta Discord, velocidade de checkout,
// chargebacks/refunds historicos, multiplos discord_id no mesmo IP,
// blacklist explicita. Score 0..100, threshold configuravel.

const { db, getConfig } = require('../database/connection');
const logger = require('../utils/logger');

const DEFAULT_THRESHOLD = 60;

// Idade minima de conta Discord pra nao gerar warn (em dias)
const MIN_ACCOUNT_AGE_DAYS = 7;

// Velocidade de checkout: limite de tentativas por hora
const CHECKOUT_RATE_LIMIT = 5;

// Conta Discord: snowflake -> created_at em ms
function discordIdToCreatedAt(discordId) {
  try {
    const id = BigInt(discordId);
    const EPOCH = 1420070400000n;       // Discord epoch
    const ms = Number((id >> 22n) + EPOCH);
    return ms;
  } catch { return null; }
}

function ageDays(discordId) {
  const ms = discordIdToCreatedAt(discordId);
  if (!ms) return null;
  return Math.floor((Date.now() - ms) / 86400000);
}

function chargebackCount(discordId) {
  return db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE discord_id=? AND status='refunded'`).get(discordId).c;
}

function recentCheckoutAttempts(discordId, minutes = 60) {
  const since = Math.floor(Date.now() / 1000) - minutes * 60;
  return db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE discord_id=? AND created_at >= ?`).get(discordId, since).c;
}

function blacklisted(discordId) {
  const cfg = getConfig();
  const list = (cfg.fraud_blacklist || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(String(discordId));
}

// Retorna { score, signals: [], decision: 'allow'|'review'|'block' }
function score({ discordId, ip, amountCents }) {
  const signals = [];
  let s = 0;

  if (blacklisted(discordId)) {
    return { score: 100, signals: ['blacklisted'], decision: 'block' };
  }

  const age = ageDays(discordId);
  if (age != null && age < MIN_ACCOUNT_AGE_DAYS) {
    s += Math.max(0, 40 - (age * 5));
    signals.push({ kind: 'new_account', age_days: age });
  }

  const cb = chargebackCount(discordId);
  if (cb > 0) {
    s += Math.min(60, cb * 20);
    signals.push({ kind: 'chargebacks', count: cb });
  }

  const attempts = recentCheckoutAttempts(discordId, 60);
  if (attempts >= CHECKOUT_RATE_LIMIT) {
    s += Math.min(40, attempts * 6);
    signals.push({ kind: 'checkout_velocity', attempts });
  }

  if (amountCents && amountCents > 50000) {     // > R$ 500
    s += 10;
    signals.push({ kind: 'high_value', amount_cents: amountCents });
  }

  // Multiplos discord_id no mesmo IP nas ultimas 24h
  if (ip) {
    const since = Math.floor(Date.now() / 1000) - 86400;
    const r = db.prepare(`
      SELECT COUNT(DISTINCT discord_id) AS c FROM sales WHERE last_ip = ? AND created_at >= ?
    `).get(ip, since);
    if (r.c >= 3) {
      s += 20;
      signals.push({ kind: 'shared_ip', distinct_users: r.c });
    }
  }

  s = Math.min(100, s);
  const threshold = parseInt(getConfig().fraud_threshold) || DEFAULT_THRESHOLD;
  const decision = s >= 80 ? 'block' : (s >= threshold ? 'review' : 'allow');
  return { score: s, signals, decision };
}

function logEvent(saleId, result) {
  try {
    db.prepare(`UPDATE sales SET fraud_score=?, fraud_signals=? WHERE id=?`)
      .run(result.score, JSON.stringify(result.signals), saleId);
  } catch (e) { logger.warn({ err: e.message }, 'fraud log falhou'); }
}

module.exports = { score, logEvent, ageDays };
