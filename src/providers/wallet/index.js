// Registry/factory de connectors. Carrega credenciais (do banco) e devolve
// uma instancia pronta pra usar.

const { getCredential } = require('../../database/connection');
const { getProvider } = require('../../config/wallet-providers');

const CONNECTORS = {
  mercadopago: require('./mercadopago.connector'),
  pushinpay:   require('./pushinpay.connector'),
  nowpayments: require('./nowpayments.connector')
  // stripe / misticpay / asaas / efi / abacatepay — vem nas proximas rodadas
};

function isSupported(providerId) {
  return Object.prototype.hasOwnProperty.call(CONNECTORS, providerId);
}

// Le todas as credenciais que o provider declara no catalogo
function loadCredentials(providerId) {
  const meta = getProvider(providerId);
  if (!meta) return null;
  const creds = {};
  for (const c of meta.credentials || []) {
    const v = getCredential(c.key);
    if (v) creds[c.key] = v;
  }
  return creds;
}

function isConfigured(providerId) {
  const meta = getProvider(providerId);
  if (!meta) return false;
  const creds = loadCredentials(providerId) || {};
  return meta.credentials.every(c => !!creds[c.key]);
}

// Devolve instancia do connector com creds preenchidas
function instantiate(providerId) {
  if (!isSupported(providerId)) {
    const e = new Error(`provider nao suportado: ${providerId}`);
    e.code = 'provider_unsupported';
    throw e;
  }
  const Connector = CONNECTORS[providerId];
  const credentials = loadCredentials(providerId) || {};
  return new Connector({ credentials });
}

module.exports = {
  CONNECTORS,
  isSupported,
  isConfigured,
  loadCredentials,
  instantiate
};
