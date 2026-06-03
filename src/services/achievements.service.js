// Serviço de conquistas. Roda em background depois de cada venda paga.
// Calcula totais e desbloqueia tiers ainda nao desbloqueados.

const { db } = require('../database/connection');
const logger = require('../utils/logger');

// Marcos de volume (em centavos)
const VOLUME_TIERS = [
  { tier: 'bronze',    threshold: 100000 },        // R$ 1.000
  { tier: 'prata',     threshold: 1000000 },       // R$ 10.000
  { tier: 'ouro',      threshold: 10000000 },      // R$ 100.000
  { tier: 'platina',   threshold: 50000000 },      // R$ 500.000
  { tier: 'diamante',  threshold: 100000000 },     // R$ 1.000.000
  { tier: 'cristal',   threshold: 1000000000 }     // R$ 10.000.000
];

// Marcos de quantidade de vendas
const COUNT_TIERS = [
  { tier: 'bronze',   threshold: 10 },
  { tier: 'prata',    threshold: 100 },
  { tier: 'ouro',     threshold: 1000 },
  { tier: 'platina',  threshold: 10000 },
  { tier: 'diamante', threshold: 50000 }
];

const TIER_META = {
  bronze:   { color: '#cd7f32', label: 'Bronze',   emoji: '🥉' },
  prata:    { color: '#c0c0c0', label: 'Prata',    emoji: '🥈' },
  ouro:     { color: '#ffd700', label: 'Ouro',     emoji: '🥇' },
  platina:  { color: '#e5e4e2', label: 'Platina',  emoji: '💍' },
  diamante: { color: '#b9f2ff', label: 'Diamante', emoji: '💎' },
  cristal:  { color: '#ff77ff', label: 'Cristal',  emoji: '🔮' }
};

function getOwnerForSale(sale) {
  if (sale.guild_id) {
    const row = db.prepare(`SELECT ug.user_id FROM user_guilds ug WHERE ug.guild_id=? AND ug.role='owner' LIMIT 1`).get(sale.guild_id);
    if (row) return row.user_id;
  }
  const row = db.prepare(`SELECT id FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1`).get();
  return row?.id;
}

function totalVolumeFor(userId, guildId) {
  const gFilter = guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const args = guildId ? [guildId] : [];
  return db.prepare(`
    SELECT COALESCE(SUM(s.amount_cents),0) AS v
    FROM sales s
    WHERE s.status='paid' ${gFilter}
  `).get(...args).v;
}

function totalSalesCountFor(userId, guildId) {
  const gFilter = guildId ? 'AND (s.guild_id = ? OR s.guild_id IS NULL)' : '';
  const args = guildId ? [guildId] : [];
  return db.prepare(`
    SELECT COUNT(*) AS c FROM sales s WHERE s.status='paid' ${gFilter}
  `).get(...args).c;
}

function unlockIfNew(userId, guildId, kind, tier, payload = {}) {
  const existing = db.prepare(`SELECT 1 FROM achievements WHERE user_id=? AND kind=? AND tier=?`).get(userId, kind, tier);
  if (existing) return null;
  const r = db.prepare(`
    INSERT OR IGNORE INTO achievements (user_id, guild_id, kind, tier, threshold_cents, threshold_count, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, guildId || null, kind, tier, payload.threshold_cents || null, payload.threshold_count || null, JSON.stringify(payload.metadata || {}));
  if (r.changes > 0) {
    // notifica
    try {
      const meta = TIER_META[tier] || {};
      db.prepare(`INSERT INTO notifications (user_id, guild_id, kind, title, body) VALUES (?,?,?,?,?)`).run(
        userId, guildId || null, 'info',
        `${meta.emoji || '🏆'} Conquista desbloqueada: ${meta.label || tier}!`,
        kind === 'volume' ? `Você bateu R$ ${((payload.threshold_cents || 0) / 100).toLocaleString('pt-BR')} em vendas!`
        : kind === 'sales_count' ? `Você bateu ${payload.threshold_count} vendas!`
        : 'Sua loja está crescendo.'
      );
    } catch {}
    return { kind, tier };
  }
  return null;
}

function checkAfterSale(sale) {
  if (!sale || sale.status !== 'paid') return;
  try {
    const userId = getOwnerForSale(sale);
    if (!userId) return;
    const guildId = sale.guild_id || null;

    // first_sale
    unlockIfNew(userId, guildId, 'first_sale', 'bronze', { metadata: { product_id: sale.product_id } });

    const volume = totalVolumeFor(userId, guildId);
    for (const t of VOLUME_TIERS) {
      if (volume >= t.threshold) {
        unlockIfNew(userId, guildId, 'volume', t.tier, { threshold_cents: t.threshold });
      }
    }
    const count = totalSalesCountFor(userId, guildId);
    for (const t of COUNT_TIERS) {
      if (count >= t.threshold) {
        unlockIfNew(userId, guildId, 'sales_count', t.tier, { threshold_count: t.threshold });
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'achievements check falhou');
  }
}

function listFor(userId, guildId) {
  const unlocked = db.prepare(`
    SELECT * FROM achievements WHERE user_id=? ${guildId ? 'AND (guild_id=? OR guild_id IS NULL)' : ''}
    ORDER BY unlocked_at DESC
  `).all(userId, ...(guildId ? [guildId] : []));

  const volume = totalVolumeFor(userId, guildId);
  const count = totalSalesCountFor(userId, guildId);

  const locked = [];
  for (const t of VOLUME_TIERS) {
    if (!unlocked.find(a => a.kind === 'volume' && a.tier === t.tier)) {
      locked.push({
        kind: 'volume', tier: t.tier, threshold_cents: t.threshold,
        progress_pct: Math.min(100, Math.round((volume / t.threshold) * 100)),
        progress_value: volume
      });
    }
  }
  for (const t of COUNT_TIERS) {
    if (!unlocked.find(a => a.kind === 'sales_count' && a.tier === t.tier)) {
      locked.push({
        kind: 'sales_count', tier: t.tier, threshold_count: t.threshold,
        progress_pct: Math.min(100, Math.round((count / t.threshold) * 100)),
        progress_value: count
      });
    }
  }

  return {
    unlocked: unlocked.map(a => ({ ...a, meta: TIER_META[a.tier] })),
    locked: locked.map(a => ({ ...a, meta: TIER_META[a.tier] })),
    totals: { volume_cents: volume, sales_count: count }
  };
}

module.exports = { checkAfterSale, listFor, VOLUME_TIERS, COUNT_TIERS, TIER_META };
