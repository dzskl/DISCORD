// MED (Mecanismo Especial de Devolucao) — fluxo de devolucao PIX no PSP do
// vendedor. Quando o banco emissor solicita devolucao (fraude, contestacao),
// a PSP nos avisa via webhook. Nos:
//
//   1. Marcamos a sale como 'med_returned' (estado distinto de refund manual)
//   2. Revertemos o ledger se a venda ja estava liberada
//   3. Notificamos o vendedor (DM Discord + notification)
//   4. Bloqueamos o cargo entregue (se possivel)
//
// Eventos canonicos de webhook que disparam este fluxo:
//   - MP:    payment.refunded com refund_reason='dispute'
//   - Asaas: PAYMENT_CHARGEBACK_REQUESTED, PAYMENT_CHARGEBACK_DISPUTE,
//            PAYMENT_REFUND_IN_PROGRESS

const { db } = require('../database/connection');
const logger = require('../utils/logger');

async function handleMedReturn(saleId, opts = {}) {
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
  if (!sale) return { ok: false, error: 'sale_not_found' };
  if (sale.status === 'med_returned') return { ok: true, already_processed: true };

  const reason = opts.reason || 'devolucao bancaria (MED)';

  // 1. Marca status
  db.prepare(`UPDATE sales SET status='med_returned' WHERE id=?`).run(sale.id);
  try { require('./metrics.service').inc('botdash_med_total', { provider: sale.provider || 'unknown' }); } catch {}

  // 2. Reverte ledger: se a venda ja estava liberada, registra debito de retorno
  try {
    const L = require('./ledger.service');
    const netCents = sale.net_to_owner_cents || sale.amount_cents;
    if (netCents > 0 && sale.paid_at) {
      // Cria 3 entries: debita seller (available ou hold), credita platform:med_returns
      const account = sale.available_at && sale.available_at <= Math.floor(Date.now() / 1000)
        ? 'available'
        : 'hold';
      const sellerId = findSellerId(sale);
      if (sellerId) {
        L.post(db, `med-${sale.id}`, [
          { account: `user:${sellerId}:${account}`, direction: 'debit',  amount_cents: netCents,
            sale_id: sale.id, description: `MED return sale #${sale.id}` },
          { account: 'platform:med_returns',         direction: 'credit', amount_cents: netCents,
            sale_id: sale.id, description: reason }
        ]);
      }
    }
  } catch (e) { logger.warn({ err: e.message, sale_id: sale.id }, 'med ledger reverse falhou'); }

  // 3. Bloqueia saque do valor MED ate decisao manual (opcional)
  try {
    db.prepare(`
      UPDATE withdrawals SET med_blocked_cents = COALESCE(med_blocked_cents, 0) + ?
      WHERE user_id = (SELECT ug.user_id FROM user_guilds ug WHERE ug.guild_id = ? AND ug.role='owner' LIMIT 1)
        AND status IN ('pending', 'approved')
    `).run(sale.net_to_owner_cents || sale.amount_cents, sale.guild_id || '');
  } catch {}

  // 4. Notifica vendedor (in-app + DM no Discord se possivel)
  try {
    const sellerId = findSellerId(sale);
    const amountStr = `R$ ${((sale.net_to_owner_cents || sale.amount_cents) / 100).toFixed(2).replace('.', ',')}`;
    if (sellerId) {
      db.prepare(`
        INSERT INTO notifications (user_id, guild_id, kind, title, body, link)
        VALUES (?, ?, 'warning', ?, ?, '/wallet-sales.html')
      `).run(
        sellerId,
        sale.guild_id || null,
        `⚠️ Devolucao MED na venda #${sale.id}`,
        `O banco emissor solicitou devolucao da venda de ${amountStr}. Motivo: ${reason}. Saque correspondente foi bloqueado.`
      );

      // DM Discord pro vendedor (se tiver discord_id linkado)
      try {
        const u = db.prepare('SELECT discord_id FROM users WHERE id=?').get(sellerId);
        if (u?.discord_id) {
          const bot = require('./bot.service');
          const dmBody = `⚠️ **Devolucao MED na venda #${sale.id}**\n` +
            `Valor: ${amountStr}\n` +
            `Cliente: ${sale.discord_tag || sale.discord_id}\n` +
            `Motivo: ${reason}\n` +
            `Status: saque bloqueado ate decisao. Acesse o painel em /wallet-sales.html`;
          bot.dmUser(u.discord_id, dmBody).catch(() => {});
        }
      } catch {}
    }
  } catch (e) { logger.warn({ err: e.message }, 'med notification falhou'); }

  // Outbound webhook + SSE
  try {
    const payload = {
      user_id: findSellerId(sale),
      guild_id: sale.guild_id,
      sale_id: sale.id,
      amount_cents: sale.amount_cents,
      net_cents: sale.net_to_owner_cents,
      discord_id: sale.discord_id,
      provider: sale.provider,
      provider_charge_id: sale.provider_charge_id,
      reason
    };
    require('./outbound-webhooks.service').dispatch('sale.med_returned', payload).catch(() => {});
    try { require('./sse.service').emit('sale.med_returned', payload); } catch {}
  } catch {}

  return { ok: true, sale_id: sale.id, reason };
}

function findSellerId(sale) {
  try {
    if (sale.guild_id) {
      const r = db.prepare(`SELECT user_id FROM user_guilds WHERE guild_id=? AND role='owner' LIMIT 1`).get(sale.guild_id);
      if (r) return r.user_id;
    }
    const r = db.prepare(`SELECT id FROM users WHERE role='owner' AND active=1 ORDER BY id LIMIT 1`).get();
    return r?.id || null;
  } catch { return null; }
}

module.exports = { handleMedReturn };
