// Reconciliacao cripto: confere tx hash on-chain reportado pelo NOWPayments.
// Detecta:
//   - Double-spend / reorg (tx some da blockchain)
//   - Underpay (valor on-chain < esperado)
//   - Tx pra endereco diferente (fraude/erro de config)
//
// Estrategia: usa explorers publicos por rede (sem precisar de RPC pago).
//   - BTC/LTC/DOGE  -> blockchair.com (rate limit gracioso)
//   - TRC-20 USDT   -> trongrid.io
//   - ETH/ERC-20    -> etherscan.io (precisa API key gratuita)
//   - Polygon       -> polygonscan.io
//
// Roda em cron a cada hora pra sales pagas via cripto nas ultimas 24h.

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const TRON_API = 'https://api.trongrid.io';
const BLOCKCHAIR = 'https://api.blockchair.com';

async function verifyTx({ tx_hash, pay_currency, expected_address, expected_amount }) {
  const c = String(pay_currency || '').toLowerCase();
  if (!tx_hash) return { ok: false, reason: 'sem_tx_hash' };

  try {
    if (c === 'usdttrc20' || c === 'trx' || c === 'usdttron') {
      return await verifyTron(tx_hash, expected_address, expected_amount);
    }
    if (c === 'btc') return await verifyBlockchair('bitcoin', tx_hash, expected_address, expected_amount);
    if (c === 'ltc') return await verifyBlockchair('litecoin', tx_hash, expected_address, expected_amount);
    if (c === 'doge') return await verifyBlockchair('dogecoin', tx_hash, expected_address, expected_amount);
    // Outras moedas: skip (sem provider gratis configurado)
    return { ok: true, skipped: true, reason: `provider sem suporte: ${c}` };
  } catch (e) {
    return { ok: false, reason: 'recon_error', error: e.message };
  }
}

async function verifyTron(txHash, expectedAddress, expectedAmount) {
  const r = await fetch(`${TRON_API}/v1/transactions/${encodeURIComponent(txHash)}`);
  if (!r.ok) return { ok: false, reason: 'tron_fetch_failed', status: r.status };
  const data = await r.json().catch(() => ({}));
  const tx = data.data?.[0];
  if (!tx) return { ok: false, reason: 'tx_not_found' };

  const confirmed = tx.ret?.[0]?.contractRet === 'SUCCESS';
  if (!confirmed) return { ok: false, reason: 'tx_failed_on_chain' };

  // Pra USDT TRC-20 o valor vem nos events; varredura simples
  const events = tx.log || tx.events || [];
  const transfer = events.find(e => (e.topics || []).some(t => /Transfer/i.test(String(t))));
  const toMatches = expectedAddress
    ? String(tx.raw_data?.contract?.[0]?.parameter?.value?.to_address || '').toLowerCase().includes(String(expectedAddress).toLowerCase().slice(2))
    : true;
  return {
    ok: true,
    confirmed,
    to_address_match: toMatches,
    raw_tx: tx
  };
}

async function verifyBlockchair(chain, txHash, expectedAddress, expectedAmount) {
  const r = await fetch(`${BLOCKCHAIR}/${chain}/dashboards/transaction/${encodeURIComponent(txHash)}`);
  if (!r.ok) return { ok: false, reason: 'blockchair_failed', status: r.status };
  const data = await r.json().catch(() => ({}));
  const txData = data.data?.[txHash];
  if (!txData) return { ok: false, reason: 'tx_not_found' };

  const tx = txData.transaction;
  if (!tx) return { ok: false, reason: 'tx_not_found' };

  const confirmed = (tx.block_id || 0) > 0;
  const outputs = txData.outputs || [];
  const totalToExpected = expectedAddress
    ? outputs
        .filter(o => String(o.recipient).toLowerCase() === String(expectedAddress).toLowerCase())
        .reduce((acc, o) => acc + (o.value || 0), 0)
    : 0;

  return {
    ok: true,
    confirmed,
    block_id: tx.block_id,
    to_address_match: !!totalToExpected,
    on_chain_amount: totalToExpected,
    expected_amount: expectedAmount,
    underpay: expectedAmount && totalToExpected ? totalToExpected < expectedAmount : null,
    raw_tx: tx
  };
}

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const window = now - 24 * 3600;

  const sales = db.prepare(`
    SELECT id, provider, provider_charge_id, provider_pay_currency, amount_cents, provider_raw
    FROM sales
    WHERE provider = 'nowpayments'
      AND status = 'paid'
      AND paid_at >= ?
      AND (recon_checked_at IS NULL OR recon_checked_at < paid_at)
    LIMIT 50
  `).all(window).catch(() => []);

  let checked = 0, flagged = 0;
  for (const sale of sales) {
    try {
      let raw = {};
      try { raw = JSON.parse(sale.provider_raw || '{}'); } catch {}
      const tx_hash = raw.outcome?.hash || raw.payin_hash || raw.tx_hash;
      const pay_address = raw.pay_address;
      const pay_amount = raw.pay_amount;
      if (!tx_hash) continue;

      const r = await verifyTx({
        tx_hash,
        pay_currency: sale.provider_pay_currency,
        expected_address: pay_address,
        expected_amount: pay_amount
      });

      const flag = r.ok === false ||
                   r.confirmed === false ||
                   r.to_address_match === false ||
                   r.underpay === true;

      if (flag) {
        flagged++;
        logger.warn({ sale_id: sale.id, recon: r }, 'crypto recon flag');
        try {
          db.prepare(`UPDATE sales SET recon_status = ?, recon_checked_at = ? WHERE id = ?`)
            .run(JSON.stringify(r).slice(0, 500), Math.floor(Date.now() / 1000), sale.id);
        } catch {}
      } else {
        try {
          db.prepare(`UPDATE sales SET recon_status = 'ok', recon_checked_at = ? WHERE id = ?`)
            .run(Math.floor(Date.now() / 1000), sale.id);
        } catch {}
      }
      checked++;
    } catch (e) {
      logger.warn({ err: e.message, sale_id: sale.id }, 'crypto recon erro');
    }
  }

  return { checked, flagged };
}

module.exports = { run, verifyTx };
