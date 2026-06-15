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

// GET /api/payment-providers/migration-status — info pra UI mostrar banner
// quando o vendedor ainda usa os endpoints legados (/api/checkout/webhook,
// /api/checkout/pix) e ja tem wallet configurada.
router.get('/migration-status', requireAuth, (req, res) => {
  const { db: legacyDb, getCredential } = require('../database/connection');
  const gFilter = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const gArgs   = req.guildId ? [req.guildId] : [];
  const now = Math.floor(Date.now() / 1000);
  const last30 = now - 30 * 86400;

  // Vendas pelo legado nos ultimos 30d (provider IS NULL ou stripe_session_id)
  const legacy = legacyDb.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS gross
    FROM sales
    WHERE status='paid' AND provider IS NULL AND paid_at >= ?
      ${gFilter}
  `).get(last30, ...gArgs);

  const wallet = legacyDb.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS gross
    FROM sales
    WHERE status='paid' AND provider IS NOT NULL AND paid_at >= ?
      ${gFilter}
  `).get(last30, ...gArgs);

  const stripeLegacyOn = !!getCredential('STRIPE_SECRET_KEY');
  const misticLegacyOn = !!getCredential('MISTICPAY_CLIENT_ID');

  res.json({
    legacy_sales_30d:   legacy.count,
    legacy_gross_30d:   legacy.gross,
    wallet_sales_30d:   wallet.count,
    wallet_gross_30d:   wallet.gross,
    has_legacy_creds:   stripeLegacyOn || misticLegacyOn,
    deprecation_active: true,
    sunset_date:        '2026-12-31',
    successor_endpoint: '/api/checkout/wallet/create'
  });
});

// GET /api/payment-providers/stats — receita por PSP (vendedor logado)
const { db } = require('../database/connection');
router.get('/stats', requireAuth, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const monthStart = now - 30 * 86400;
  const gFilter = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const gArgs   = req.guildId ? [req.guildId] : [];

  const rows = db.prepare(`
    SELECT
      provider,
      COUNT(*)                          AS sales_count,
      COALESCE(SUM(amount_cents), 0)    AS gross_cents,
      COALESCE(SUM(CASE WHEN paid_at >= ? THEN amount_cents END), 0) AS gross_month_cents,
      COALESCE(SUM(CASE WHEN paid_at >= ? THEN 1 END), 0)            AS sales_month
    FROM sales
    WHERE provider IS NOT NULL
      AND status = 'paid'
      ${gFilter}
    GROUP BY provider
    ORDER BY gross_cents DESC
  `).all(monthStart, monthStart, ...gArgs);

  // Pending por PSP (cobrancas aguardando)
  const pending = db.prepare(`
    SELECT provider, COUNT(*) AS pending_count
    FROM sales
    WHERE provider IS NOT NULL
      AND status = 'pending'
      ${gFilter}
    GROUP BY provider
  `).all(...gArgs);
  const pendingMap = Object.fromEntries(pending.map(p => [p.provider, p.pending_count]));

  const wallet = require('../config/wallet-providers');
  const out = rows.map(r => ({
    provider: r.provider,
    label:    wallet.getProvider(r.provider)?.label || r.provider,
    method:   wallet.getProvider(r.provider)?.method || 'unknown',
    sales_count:       r.sales_count,
    gross_cents:       r.gross_cents,
    gross_month_cents: r.gross_month_cents,
    sales_month:       r.sales_month,
    pending_count:     pendingMap[r.provider] || 0
  }));

  // Totalizadores
  const total_gross = out.reduce((a, p) => a + p.gross_cents, 0);
  const total_month = out.reduce((a, p) => a + p.gross_month_cents, 0);
  const total_sales = out.reduce((a, p) => a + p.sales_count, 0);

  res.json({
    providers: out,
    totals: { gross_cents: total_gross, gross_month_cents: total_month, sales_count: total_sales }
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
