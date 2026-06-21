// Polling fallback pros wallet payments. Se um webhook do PSP nao chegar
// (rede caiu, DNS, retry burst...), buscamos o status direto via API depois
// de 10min sem mudanca. Marca a sale como paid/expired se necessario.
//
// So mexe em sales (provider IS NOT NULL AND status='pending' AND idade>10min).

const { db } = require('../database/connection');
const registry = require('../providers/wallet');
const { fulfillSale } = require('../services/fulfillment.service');
const logger = require('../utils/logger');

const STALE_AFTER_SECONDS = 10 * 60;       // 10 min sem webhook
const MAX_AGE_SECONDS     = 48 * 3600;     // ignora sales >48h (caducaram)
const BATCH                = 25;            // max por execucao

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const oldest = now - MAX_AGE_SECONDS;
  const stale  = now - STALE_AFTER_SECONDS;

  const rows = db.prepare(`
    SELECT id, provider, provider_charge_id, created_at, status
    FROM sales
    WHERE provider IS NOT NULL
      AND provider_charge_id IS NOT NULL
      AND status = 'pending'
      AND created_at <= ?
      AND created_at >= ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(stale, oldest, BATCH);

  if (!rows.length) return { checked: 0 };

  let resolved = 0, errors = 0;
  for (const sale of rows) {
    try {
      if (!registry.isSupported(sale.provider) || !registry.isConfigured(sale.provider)) {
        // PSP sumiu da config — marca como failed pra nao ficar zumbi
        db.prepare(`UPDATE sales SET status='failed' WHERE id=?`).run(sale.id);
        continue;
      }
      const connector = registry.instantiate(sale.provider);
      if (typeof connector.fetchPayment !== 'function') continue;

      const payment = await connector.fetchPayment(sale.provider_charge_id);

      // Mapeia status: usa o mapStatus do connector se existir
      let mapped;
      if (typeof connector.mapStatus === 'function') {
        mapped = connector.mapStatus(payment);
      } else {
        const s = String(payment.payment_status || payment.status || '').toLowerCase();
        if (['paid', 'approved', 'finished', 'confirmed'].includes(s)) mapped = 'paid';
        else if (['expired', 'cancelled', 'failed'].includes(s))        mapped = 'expired';
        else if (s === 'refunded')                                       mapped = 'refunded';
        else mapped = 'pending';
      }

      if (mapped === 'paid') {
        await fulfillSale(sale.id, { metadata: {} });
        resolved++;
        logger.info({ sale_id: sale.id, provider: sale.provider }, 'polling resolveu sale paga');
      } else if (mapped === 'expired') {
        db.prepare(`UPDATE sales SET status='expired' WHERE id=? AND status='pending'`).run(sale.id);
        resolved++;
      }
      // pending real continua pending — proxima rodada checka de novo
    } catch (e) {
      errors++;
      logger.warn({ err: e.message, sale_id: sale.id, provider: sale.provider }, 'polling falhou');
    }
  }

  return { checked: rows.length, resolved, errors };
}

module.exports = { run };
