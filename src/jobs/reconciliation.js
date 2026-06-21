// Reconciliacao com MysticPay.
//
// Roda periodicamente e cruza as sales 'pending' (com stripe_session_id 'mp:*')
// dos ultimos N dias contra o status real na API.
// Detecta:
//   - vendas pagas que nao receberam webhook (marca como paid)
//   - vendas pendentes ha muito tempo (marca como expired)
//   - vendas estornadas/refundadas (marca como refunded, reverte saldo)
//
// Limite: max 100 vendas por execucao pra nao estourar quota API.

const { db, logEvent } = require('../database/connection');
const mp = require('../services/misticpay.service');
const logger = require('../utils/logger');

const LOOKBACK_DAYS = parseInt(process.env.RECON_LOOKBACK_DAYS) || 7;
const MAX_PER_RUN   = parseInt(process.env.RECON_MAX_PER_RUN)   || 100;
const STALE_HOURS   = parseInt(process.env.RECON_STALE_HOURS)   || 48;

async function run() {
  if (!mp.isConfigured()) {
    logger.debug('reconciliation: MysticPay nao configurado, pulando');
    return { skipped: true };
  }

  const now = Math.floor(Date.now() / 1000);
  const since = now - LOOKBACK_DAYS * 86400;
  const staleBefore = now - STALE_HOURS * 3600;

  const pending = db.prepare(`
    SELECT id, stripe_session_id, amount_cents, created_at, discord_id
    FROM sales
    WHERE status = 'pending'
      AND stripe_session_id LIKE 'mp:%'
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(since, MAX_PER_RUN);

  let promoted = 0, expired = 0, refunded = 0, errors = 0;

  for (const sale of pending) {
    const txId = sale.stripe_session_id.replace(/^mp:/, '');
    try {
      const remote = await mp.getTransaction(txId);
      const status = String(remote.status || '').toUpperCase();

      if (['APROVADO', 'APPROVED', 'PAID', 'PAGO'].includes(status)) {
        // Promove pra paid usando o mesmo fluxo do webhook
        const markPaid = require('../controllers/checkout_misticpay.controller')._markPaid;
        if (markPaid) {
          await markPaid(sale, txId);
          promoted++;
          logEvent({ type: 'reconciliacao', message: `Sale ${sale.id} promovida a paid via reconciliacao` });
        } else {
          // Fallback minimo: marca paid e aplica taxas/hold
          db.prepare(`UPDATE sales SET status='paid', paid_at=strftime('%s','now') WHERE id=?`).run(sale.id);
          try { require('../config/platform-fee').applyFeeToSale(db, sale.id); } catch {}
          try { require('../config/hold-period').applyHoldToSale(db, sale.id); } catch {}
          promoted++;
        }
      } else if (['ESTORNADO', 'REFUNDED', 'CANCELADO', 'CANCELLED', 'CHARGEBACK'].includes(status)) {
        db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
        refunded++;
        logEvent({ type: 'reconciliacao', message: `Sale ${sale.id} marcada refunded via reconciliacao` });
      } else if (['EXPIRED', 'EXPIRADO', 'FAILED', 'FALHOU'].includes(status) || sale.created_at < staleBefore) {
        // Vendas muito antigas em pending = expiradas
        db.prepare(`UPDATE sales SET status='expired' WHERE id=?`).run(sale.id);
        expired++;
      }
    } catch (e) {
      errors++;
      logger.warn({ err: e.message, sale_id: sale.id, txId }, 'reconciliacao: erro consultando MysticPay');
    }
  }

  const summary = { checked: pending.length, promoted, expired, refunded, errors };
  if (pending.length > 0) {
    logger.info(summary, 'reconciliacao MysticPay rodou');
  }
  return summary;
}

module.exports = { run };
