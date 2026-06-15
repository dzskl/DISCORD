// Monitor de fraude: alerta quando o ratio de MED nas ultimas 24h passa
// de um threshold. Roda a cada 6h, evita spam usando rate limit no banco.
//
// Razao: MED em volume = sinal de cliente problemático, vendedor mal-intencionado,
// produto com problema ou ataque de chargeback. Vendedor precisa saber antes
// que o PSP suspenda a conta.

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const MED_THRESHOLD_PCT = parseFloat(process.env.MED_ALERT_THRESHOLD_PCT) || 5.0;
const MIN_SALES_FOR_ALERT = 10;
const ALERT_COOLDOWN_HOURS = 12;

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const last24 = now - 24 * 3600;

  // Agrupa por vendedor (guild ou owner). Por simplicidade, alerta por guild_id.
  const rows = db.prepare(`
    SELECT
      COALESCE(guild_id, 'owner_default') AS gid,
      COUNT(*) AS total,
      SUM(CASE WHEN status='med_returned' THEN 1 ELSE 0 END) AS med
    FROM sales
    WHERE provider IS NOT NULL
      AND COALESCE(paid_at, created_at) >= ?
    GROUP BY gid
    HAVING total >= ?
  `).all(last24, MIN_SALES_FOR_ALERT);

  let alerts = 0;
  for (const r of rows) {
    const pct = (r.med / r.total) * 100;
    if (pct < MED_THRESHOLD_PCT) continue;

    // Cooldown: nao alerta o mesmo seller duas vezes em 12h
    const lastAlert = lastAlertAt(r.gid);
    if (lastAlert && (now - lastAlert) < ALERT_COOLDOWN_HOURS * 3600) continue;

    fireAlert(r.gid, r.med, r.total, pct);
    alerts++;
  }

  return { checked: rows.length, alerts };
}

function lastAlertAt(gid) {
  try {
    const r = db.prepare(`
      SELECT MAX(created_at) AS at FROM notifications
      WHERE kind='warning' AND title LIKE 'Alerta de MED%'
        AND COALESCE(guild_id, 'owner_default') = ?
    `).get(gid);
    return r?.at || null;
  } catch { return null; }
}

function fireAlert(gid, medCount, total, pct) {
  const guildId = gid === 'owner_default' ? null : gid;

  // Identifica usuarios destinatarios (owners + admins da guild OU owners globais)
  let targets = [];
  try {
    targets = guildId
      ? db.prepare(`SELECT user_id AS id FROM user_guilds WHERE guild_id=? AND role IN ('owner','admin')`).all(guildId)
      : db.prepare(`SELECT id FROM users WHERE role='owner' AND active=1`).all();
  } catch {}

  const title = `Alerta de MED: ${pct.toFixed(1)}% nas ultimas 24h`;
  const body  = `${medCount} de ${total} vendas viraram MED (devolucao bancaria). Investigue antes que a PSP suspenda a conta.`;

  for (const u of targets) {
    try {
      db.prepare(`
        INSERT INTO notifications (user_id, guild_id, kind, title, body, link)
        VALUES (?, ?, 'warning', ?, ?, '/wallet-sales.html')
      `).run(u.id, guildId, title, body);

      // DM Discord
      const dUser = db.prepare(`SELECT discord_id FROM users WHERE id=?`).get(u.id);
      if (dUser?.discord_id) {
        try {
          const bot = require('./bot.service');
          bot.dmUser(dUser.discord_id, `🚨 **${title}**\n${body}`).catch(() => {});
        } catch {}
      }
    } catch (e) { logger.warn({ err: e.message }, 'fraud alert insert falhou'); }
  }

  // Canal de moderacao da guild (se configurado)
  if (guildId) {
    try {
      const cfg = db.prepare(`SELECT mod_channel_id FROM guilds WHERE id=?`).get(guildId);
      if (cfg?.mod_channel_id) {
        const bot = require('./bot.service');
        if (typeof bot.sendChannelMessage === 'function') {
          bot.sendChannelMessage(cfg.mod_channel_id,
            `🚨 **${title}**\n${body}\nDetalhes: /wallet-sales.html`
          ).catch(() => {});
        }
      }
    } catch {}
  }

  logger.warn({ gid, med: medCount, total, pct }, 'fraud monitor disparou alerta');
}

module.exports = { run };
