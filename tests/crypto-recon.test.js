// Crypto reconciliation: testa verifyTx com responses mockadas dos explorers.

const recon = require('../src/services/crypto-recon.service');

const origFetch = global.fetch;
function mockFetch(handler) {
  global.fetch = async (url) => {
    const body = handler(url);
    return {
      ok: body !== null,
      status: body !== null ? 200 : 404,
      json: async () => body || {}
    };
  };
}
function restoreFetch() { global.fetch = origFetch; }

test('recon: sem tx_hash retorna sem_tx_hash', async () => {
  const r = await recon.verifyTx({ pay_currency: 'btc', tx_hash: null });
  assertEq(r.ok, false);
  assertEq(r.reason, 'sem_tx_hash');
});

test('recon: moeda nao suportada retorna skipped', async () => {
  const r = await recon.verifyTx({ pay_currency: 'ada', tx_hash: 'abc' });
  assertEq(r.ok, true);
  assertEq(r.skipped, true);
});

test('recon: TRC-20 USDT — tx confirmada SUCCESS', async () => {
  mockFetch(() => ({
    data: [{
      ret: [{ contractRet: 'SUCCESS' }],
      raw_data: { contract: [{ parameter: { value: { to_address: 'TXYZ' } } }] }
    }]
  }));
  const r = await recon.verifyTx({
    pay_currency: 'usdttrc20',
    tx_hash: 'tx_hash_123',
    expected_address: 'TXYZ'
  });
  restoreFetch();
  assertEq(r.ok, true);
  assertEq(r.confirmed, true);
});

test('recon: TRC-20 — tx_failed_on_chain quando contractRet != SUCCESS', async () => {
  mockFetch(() => ({
    data: [{ ret: [{ contractRet: 'REVERT' }], raw_data: {} }]
  }));
  const r = await recon.verifyTx({
    pay_currency: 'usdttrc20',
    tx_hash: 'tx_revert',
    expected_address: 'TXYZ'
  });
  restoreFetch();
  assertEq(r.ok, false);
  assertEq(r.reason, 'tx_failed_on_chain');
});

test('recon: BTC blockchair — tx confirmada com underpay detectado', async () => {
  const txHash = 'btc_abc';
  mockFetch(() => ({
    data: {
      [txHash]: {
        transaction: { block_id: 800000 },
        outputs: [
          { recipient: 'bc1qaddr', value: 50000 }   // 0.0005 BTC
        ]
      }
    }
  }));
  const r = await recon.verifyTx({
    pay_currency: 'btc',
    tx_hash: txHash,
    expected_address: 'bc1qaddr',
    expected_amount: 100000   // esperava 0.001 BTC
  });
  restoreFetch();
  assertEq(r.ok, true);
  assertEq(r.confirmed, true);
  assertEq(r.to_address_match, true);
  assertEq(r.underpay, true, 'detectou underpay');
});

test('recon: BTC tx nao encontrada', async () => {
  mockFetch(() => ({ data: {} }));
  const r = await recon.verifyTx({
    pay_currency: 'btc',
    tx_hash: 'tx_inexistente',
    expected_address: 'bc1q'
  });
  restoreFetch();
  assertEq(r.ok, false);
  assertEq(r.reason, 'tx_not_found');
});
