// Catalogo de PSPs (Payment Service Providers) que o vendedor pode plugar.
//
// BotDash eh INTERMEDIARIO: nao toca em dinheiro. Cada vendedor pluga as
// credenciais da PSP dele e o dinheiro cai direto na conta dele.
//
// Cada provider declara:
//   - method:     'pix' | 'card' | 'crypto'  (categoria)
//   - country:    'BR' | 'GLOBAL'
//   - credentials: campos que o vendedor precisa colar
//   - fee_hint:   taxa tipica que a PSP cobra do vendedor (so pra UI)
//   - kyc:        nivel de KYC ('cpf' | 'cnpj' | 'easy' | 'strict')
//   - docs_url:   onde o vendedor pega as credenciais

const PROVIDERS = {
  mercadopago: {
    id: 'mercadopago',
    label: 'MercadoPago',
    method: 'pix',
    country: 'BR',
    credentials: [
      { key: 'MP_ACCESS_TOKEN', label: 'Access Token',  type: 'secret',
        hint: 'production access token (APP_USR-...)' }
    ],
    fee_hint: '0,99% (PIX) · sem mensalidade',
    kyc: 'cpf',
    docs_url: 'https://www.mercadopago.com.br/developers/panel/app',
    sort: 1
  },

  pushinpay: {
    id: 'pushinpay',
    label: 'PushinPay',
    method: 'pix',
    country: 'BR',
    credentials: [
      { key: 'PUSHINPAY_TOKEN', label: 'API Token', type: 'secret',
        hint: 'token de producao do painel da PushinPay' }
    ],
    fee_hint: 'R$ 0,99 ou 2,99% (o que for menor)',
    kyc: 'cpf',
    docs_url: 'https://docs.pushinpay.com.br',
    sort: 2
  },

  abacatepay: {
    id: 'abacatepay',
    label: 'AbacatePay',
    method: 'pix',
    country: 'BR',
    credentials: [
      { key: 'ABACATE_API_KEY', label: 'API Key', type: 'secret',
        hint: 'chave de producao do AbacatePay' }
    ],
    fee_hint: '0,80% por venda',
    kyc: 'cpf',
    docs_url: 'https://docs.abacatepay.com',
    sort: 3
  },

  efi: {
    id: 'efi',
    label: 'Efí (ex-Gerencianet)',
    method: 'pix',
    country: 'BR',
    credentials: [
      { key: 'EFI_CLIENT_ID',     label: 'Client ID',     type: 'text' },
      { key: 'EFI_CLIENT_SECRET', label: 'Client Secret', type: 'secret' },
      { key: 'EFI_CERTIFICATE',   label: 'Certificado .p12 (base64)', type: 'secret',
        hint: 'cole o conteudo do .p12 em base64' }
    ],
    fee_hint: 'a partir de R$ 0,09 por PIX',
    kyc: 'cnpj',
    docs_url: 'https://dev.efipay.com.br',
    sort: 4
  },

  asaas: {
    id: 'asaas',
    label: 'Asaas',
    method: 'pix',
    country: 'BR',
    credentials: [
      { key: 'ASAAS_API_KEY', label: 'API Key', type: 'secret',
        hint: 'gere em Integracoes > API no painel Asaas' }
    ],
    fee_hint: 'R$ 1,99 por PIX',
    kyc: 'cpf',
    docs_url: 'https://docs.asaas.com',
    sort: 5
  },

  stripe: {
    id: 'stripe',
    label: 'Stripe',
    method: 'card',
    country: 'GLOBAL',
    credentials: [
      { key: 'STRIPE_SECRET_KEY',     label: 'Secret Key',     type: 'secret',
        hint: 'sk_live_... ou sk_test_...' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook Secret', type: 'secret',
        hint: 'whsec_...' }
    ],
    fee_hint: '3,99% + R$ 0,39 (cartao BR)',
    kyc: 'strict',
    docs_url: 'https://dashboard.stripe.com/apikeys',
    sort: 6
  },

  misticpay: {
    id: 'misticpay',
    label: 'MisticPay',
    method: 'pix',
    country: 'BR',
    credentials: [
      { key: 'MISTICPAY_CLIENT_ID',     label: 'Client ID',     type: 'secret' },
      { key: 'MISTICPAY_CLIENT_SECRET', label: 'Client Secret', type: 'secret' }
    ],
    fee_hint: 'taxa do contrato MisticPay',
    kyc: 'cpf',
    docs_url: 'https://misticpay.com',
    sort: 7
  },

  nowpayments: {
    id: 'nowpayments',
    label: 'NOWPayments (cripto)',
    method: 'crypto',
    country: 'GLOBAL',
    credentials: [
      { key: 'NOWPAYMENTS_API_KEY',    label: 'API Key',    type: 'secret' },
      { key: 'NOWPAYMENTS_IPN_SECRET', label: 'IPN Secret', type: 'secret',
        hint: 'usado pra validar webhook' }
    ],
    fee_hint: '0,4% (non-custodial) · USDT/BTC/ETH/...',
    kyc: 'easy',
    docs_url: 'https://nowpayments.io/dashboard',
    sort: 8
  }
};

// Feature-flag de cada provider amarrada ao plano (do plans.js).
// Define qual feature do plano libera cada provider.
const PROVIDER_FEATURE = {
  mercadopago: 'mercadopago_checkout',
  pushinpay:   'pushinpay_checkout',
  abacatepay:  'pushinpay_checkout',     // mesma trava de PIX nacional
  efi:         'asaas_checkout',
  asaas:       'asaas_checkout',
  stripe:      'stripe_checkout',
  misticpay:   'misticpay_checkout',
  nowpayments: 'crypto_checkout'
};

function listProviders({ country, method } = {}) {
  let all = Object.values(PROVIDERS).sort((a, b) => a.sort - b.sort);
  if (country) all = all.filter(p => p.country === country || p.country === 'GLOBAL');
  if (method)  all = all.filter(p => p.method === method);
  return all;
}

function getProvider(id) {
  return PROVIDERS[id] || null;
}

function providerFeature(id) {
  return PROVIDER_FEATURE[id] || null;
}

module.exports = { PROVIDERS, PROVIDER_FEATURE, listProviders, getProvider, providerFeature };
