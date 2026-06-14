// Endpoints pra UI da "Wallet" do vendedor — lista PSPs disponiveis,
// mostra quais ja foram configurados, e quais o plano libera.

const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const wallet = require('../config/wallet-providers');
const registry = require('../providers/wallet');
const plans = require('../config/plans');

const router = express.Router();

// GET /api/payment-providers — lista catalogo + estado por provider
router.get('/', requireAuth, (req, res) => {
  const plan = plans.planFor(req);

  const items = wallet.listProviders().map(p => {
    const featureKey = wallet.providerFeature(p.id);
    const allowed = featureKey ? !!plan.features[featureKey] : true;
    return {
      id: p.id,
      label: p.label,
      method: p.method,
      country: p.country,
      fee_hint: p.fee_hint,
      kyc: p.kyc,
      docs_url: p.docs_url,
      credentials: p.credentials.map(c => ({
        key: c.key, label: c.label, type: c.type, hint: c.hint || null
      })),
      // Estado runtime
      supported: registry.isSupported(p.id),
      configured: registry.isConfigured(p.id),
      allowed_by_plan: allowed,
      required_feature: featureKey
    };
  });

  res.json({
    plan_id: plan.id,
    plan_name: plan.name,
    providers: items
  });
});

// GET /api/payment-providers/public — pra loja (sem auth) listar opcoes
// de pagamento que o vendedor ja configurou
router.get('/public', (req, res) => {
  const items = wallet.listProviders()
    .map(p => ({
      id: p.id,
      label: p.label,
      method: p.method,
      country: p.country,
      configured: registry.isSupported(p.id) && registry.isConfigured(p.id)
    }))
    .filter(p => p.configured);   // so retorna o que o vendedor ja plugou
  res.json(items);
});

// GET /api/payment-providers/:id — detalhes de um provider
router.get('/:id', requireAuth, (req, res) => {
  const p = wallet.getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'provider desconhecido' });
  res.json({
    ...p,
    supported: registry.isSupported(p.id),
    configured: registry.isConfigured(p.id)
  });
});

module.exports = router;
