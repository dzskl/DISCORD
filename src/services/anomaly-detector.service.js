// Detecta queda anomala de GMV: compara ultimas 24h vs media das 7 ultimas
// "janelas de 24h" (mesma hora do dia, dias anteriores). Se cair >50%, notifica.
//
// Roda 1x por hora. Cooldown 6h por alerta (evita spam).

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const DROP_THRESHOLD = parseFloat(process.env.GMV_DROP_THRESHOLD) || 0.5;   // 50%
const MIN_BASELINE_CENTS = 10_000;   // ignora se baseline < R$100 (ruido)
const COOLDOWN_HOURS = 6;

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const last24 = now - 86400;

  // GMV nas ultimas 24h
  const recent = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS v
    FROM sales WHERE status='paid' AND provider IS NOT NULL AND paid_at >= ?
  `).get(last24).v;

  // Baseline: media de 7 dias anteriores (dias 2..8 atras)
  const baselineStart = now - 8 * 86400;
  const baselineEnd = now - 1 * 86400;
  const baselineRow = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS v
    FROM sales WHERE status='paid' AND provider IS NOT NULL
      AND paid_at >= ? AND paid_at < ?
  `).get(baselineStart, baselineEnd);
  const baseline = Math.round(baselineRow.v / 7);

  if (baseline < MIN_BASELINE_CENTS) {
    return { recent, baseline, skipped: 'baseline_too_small' };
  }

  const ratio = recent / baseline;
  if (ratio >= (1 - DROP_THRESHOLD)) {
    return { recent, baseline, ratio: Math.round(ratio * 100) / 100, ok: true };
  }

  // Cooldown: nao alerta de novo nas ultimas 6h
  const cutoff = now - COOLDOWN_HOURS * 3600;
  const last = db.prepare(`
    SELECT MAX(created_at) AS at FROM notifications
    WHERE kind='warning' AND title LIKE 'Anomalia GMV%' AND created_at >= ?
  `).get(cutoff);
  if (last?.at) {
    return { recent, baseline, ratio, in_cooldown: true };
  }

  // Dispara: notifica owners
  fireAlert(recent, baseline, ratio);
  return { recent, baseline, ratio: Math.round(ratio * 100) / 100, alerted: true };
}

function fireAlert(recent, baseline, ratio) {
  const owners = db.prepare(`SELECT id, discord_id FROM users WHERE role='owner' AND active=1`).all();
  const drop = Math.round((1 - ratio) * 100);
  const title = `Anomalia GMV: queda ${drop}% em 24h`;
  const body = `Ultimas 24h: R$ ${(recent/100).toFixed(2)} · baseline (7d): R$ ${(baseline/100).toFixed(2)}`;
  for (const u of owners) {
    try {
      db.prepare(`
        INSERT INTO notifications (user_id, kind, title, body, link)
        VALUES (?, 'warning', ?, ?, '/wallet-providers.html')
      `).run(u.id, title, body);
      if (u.discord_id) {
        try {
          const bot = require('./bot.service');
          bot.dmUser(u.discord_id, `🚨 **${title}**\n${body}`).catch(() => {});
        } catch {}
      }
    } catch (e) { logger.warn({ err: e.message }, 'anomaly alert insert falhou'); }
  }
  logger.warn({ recent, baseline, ratio }, 'GMV anomaly disparada');
}

module.exports = { run, DROP_THRESHOLD };
