// Backfill: marca sales legadas (pre-Wallet) com o provider correto.
//
// Heuristica:
//   - sales.stripe_session_id NOT NULL -> provider='stripe', charge_id=session_id
//   - sales que vieram via MisticPay (sem stripe_session_id mas existem) ->
//     inferir como 'misticpay' SO se tiver pix_transaction_id na metadata
//   - Demais -> deixa NULL (nao consegue inferir)
//
// Rodar uma vez via /admin/api/wallet/backfill (super-admin) ou direto no CLI.

const { db } = require('../database/connection');
const logger = require('../utils/logger');

function run({ dryRun = false } = {}) {
  const stats = { checked: 0, stripe_marked: 0, misticpay_marked: 0, skipped: 0 };

  // Pega TODAS as sales sem provider preenchido
  const rows = db.prepare(`
    SELECT id, stripe_session_id, stripe_payment_intent
    FROM sales
    WHERE provider IS NULL
  `).all();

  stats.checked = rows.length;

  for (const r of rows) {
    if (r.stripe_session_id) {
      if (!dryRun) {
        db.prepare(`
          UPDATE sales
          SET provider = 'stripe', provider_charge_id = ?
          WHERE id = ? AND provider IS NULL
        `).run(r.stripe_session_id, r.id);
      }
      stats.stripe_marked++;
      continue;
    }
    // MisticPay legado guarda o transactionId em outra estrutura (provider_raw
    // ainda nao existia). Sem campo confiavel pra inferir — pula.
    stats.skipped++;
  }

  if (!dryRun) {
    logger.info(stats, 'wallet backfill executado');
  }
  return stats;
}

module.exports = { run };
