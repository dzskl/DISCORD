const BASE = 'https://api.misticpay.com';

function headers() {
  return {
    'Content-Type': 'application/json',
    'ci': process.env.MISTICPAY_CLIENT_ID || '',
    'cs': process.env.MISTICPAY_CLIENT_SECRET || ''
  };
}

function isConfigured() {
  return !!(process.env.MISTICPAY_CLIENT_ID && process.env.MISTICPAY_CLIENT_SECRET);
}

async function createPixTransaction({ amount_cents, payerName, payerDocument, transactionId, description }) {
  if (!isConfigured()) throw new Error('MisticPay nao configurado');
  const r = await fetch(`${BASE}/api/transactions/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      amount: (amount_cents / 100).toFixed(2),
      payerName: payerName || 'Cliente',
      payerDocument: payerDocument || '00000000000',
      transactionId,
      description: (description || 'Compra').slice(0, 120)
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || data?.error || `MisticPay HTTP ${r.status}`);
  return data?.data || data;
}

async function getTransaction(transactionId) {
  if (!isConfigured()) throw new Error('MisticPay nao configurado');
  const r = await fetch(`${BASE}/api/transactions/${encodeURIComponent(transactionId)}`, {
    method: 'GET',
    headers: headers()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || `MisticPay HTTP ${r.status}`);
  return data?.data || data;
}

async function testConnection() {
  if (!isConfigured()) throw new Error('credenciais nao definidas');
  // Tenta listar uma transacao fake (esperamos 404 ou similar) so pra validar auth
  const r = await fetch(`${BASE}/api/transactions/__ping__`, { method: 'GET', headers: headers() });
  if (r.status === 401 || r.status === 403) throw new Error('credenciais invalidas');
  return true;
}

module.exports = { createPixTransaction, getTransaction, isConfigured, testConnection };
