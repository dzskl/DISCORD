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

// GET /api/payment-providers/global — visao consolidada por guild
// (super-admin only). Mostra receita Wallet de cada guild registrada.
router.get('/global', requireAuth, (req, res) => {
  try {
    const { isSuperAdmin } = require('../middlewares/auth.middleware');
    if (!isSuperAdmin || !isSuperAdmin(req.appUser)) {
      return res.status(403).json({ error: 'super-admin somente' });
    }
  } catch { return res.status(403).json({ error: 'super-admin somente' }); }

  const now = Math.floor(Date.now() / 1000);
  const monthStart = now - 30 * 86400;
  const dbConn = require('../database/connection').db;

  const rows = dbConn.prepare(`
    SELECT
      COALESCE(s.guild_id, '(default)') AS guild_id,
      g.name AS guild_name,
      COUNT(*) AS sales_count,
      COALESCE(SUM(s.amount_cents), 0) AS gross_cents,
      COALESCE(SUM(CASE WHEN s.paid_at >= ? THEN s.amount_cents END), 0) AS month_cents,
      COUNT(DISTINCT s.provider) AS providers_used
    FROM sales s
    LEFT JOIN guilds g ON g.id = s.guild_id
    WHERE s.status='paid' AND s.provider IS NOT NULL
    GROUP BY guild_id
    ORDER BY month_cents DESC
  `).all(monthStart);

  const totals = rows.reduce((a, r) => ({
    sales: a.sales + r.sales_count,
    gross: a.gross + r.gross_cents,
    month: a.month + r.month_cents
  }), { sales: 0, gross: 0, month: 0 });

  res.json({ guilds: rows, totals });
});

// POST /api/payment-providers/backfill — backfill de sales legadas
// Marca sales com stripe_session_id como provider='stripe'
router.post('/backfill', requireAuth, (req, res) => {
  // Super-admin only check (reuse middleware)
  try {
    const { isSuperAdmin } = require('../middlewares/auth.middleware');
    if (!isSuperAdmin || !isSuperAdmin(req.appUser)) {
      return res.status(403).json({ error: 'super-admin somente' });
    }
  } catch {}
  const dry = req.body?.dry_run === true || req.query?.dry_run === '1';
  const r = require('../jobs/wallet-backfill').run({ dryRun: dry });
  res.json({ ok: true, dry_run: dry, ...r });
});

// GET /api/payment-providers/usage-report — relatorio mensal do vendedor
//   ?month=YYYY-MM (default mes atual)
//   Retorna: vendas, GMV, refunds, MEDs, breakdown por provider, ticket medio
router.get('/usage-report', requireAuth, (req, res) => {
  const dbConn = require('../database/connection').db;
  // Determina janela do mes
  const month = String(req.query.month || '').match(/^\d{4}-\d{2}$/)
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  const start = Math.floor(new Date(month + '-01T00:00:00Z').getTime() / 1000);
  const nextMonth = new Date(month + '-01T00:00:00Z');
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end = Math.floor(nextMonth.getTime() / 1000);

  const gFilter = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const gArgs = req.guildId ? [req.guildId] : [];

  // Resumo geral
  const summary = dbConn.prepare(`
    SELECT
      COUNT(*) AS total_sales,
      COALESCE(SUM(amount_cents), 0) AS gmv_cents,
      COALESCE(SUM(net_to_owner_cents), 0) AS net_cents,
      COALESCE(AVG(amount_cents), 0) AS avg_ticket_cents
    FROM sales
    WHERE status='paid' AND provider IS NOT NULL AND paid_at >= ? AND paid_at < ? ${gFilter}
  `).get(start, end, ...gArgs);

  const refunds = dbConn.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS cents
    FROM sales WHERE status='refunded' AND provider IS NOT NULL
      AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) < ? ${gFilter}
  `).get(start, end, ...gArgs);

  const meds = dbConn.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS cents
    FROM sales WHERE status='med_returned' AND provider IS NOT NULL
      AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) < ? ${gFilter}
  `).get(start, end, ...gArgs);

  // Breakdown por provider
  const byProvider = dbConn.prepare(`
    SELECT provider, COUNT(*) AS sales, COALESCE(SUM(amount_cents),0) AS gmv_cents
    FROM sales
    WHERE status='paid' AND provider IS NOT NULL AND paid_at >= ? AND paid_at < ? ${gFilter}
    GROUP BY provider ORDER BY gmv_cents DESC
  `).all(start, end, ...gArgs);

  const refundRate = summary.total_sales > 0
    ? Math.round((refunds.c / summary.total_sales) * 1000) / 10
    : 0;
  const medRate = summary.total_sales > 0
    ? Math.round((meds.c / summary.total_sales) * 1000) / 10
    : 0;

  res.json({
    month,
    period: { start, end },
    summary: {
      total_sales: summary.total_sales,
      gmv_cents: summary.gmv_cents,
      net_cents: summary.net_cents,
      avg_ticket_cents: Math.round(summary.avg_ticket_cents),
      refunds: refunds.c,
      refunds_cents: refunds.cents,
      refund_rate_pct: refundRate,
      meds: meds.c,
      meds_cents: meds.cents,
      med_rate_pct: medRate
    },
    by_provider: byProvider
  });
});

// GET /api/payment-providers/yearly — receita por mes x PSP (12 meses)
router.get('/yearly', requireAuth, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const yearAgo = now - 365 * 86400;
  const gFilter = req.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
  const gArgs   = req.guildId ? [req.guildId] : [];

  // Agrupa por (ano-mes, provider) — usa strftime do SQLite
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', paid_at, 'unixepoch') AS ym,
      provider,
      COUNT(*) AS sales_count,
      COALESCE(SUM(amount_cents), 0) AS gross_cents
    FROM sales
    WHERE status='paid' AND provider IS NOT NULL AND paid_at >= ?
      ${gFilter}
    GROUP BY ym, provider
    ORDER BY ym ASC
  `).all(yearAgo, ...gArgs);

  // Constroi grade 12-meses preenchida com 0
  const months = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = d.toISOString().slice(0, 7);  // YYYY-MM
    months.push(ym);
  }
  const providers = [...new Set(rows.map(r => r.provider))];

  const matrix = {};   // matrix[ym][provider] = { sales_count, gross_cents }
  for (const ym of months) matrix[ym] = {};
  for (const r of rows) {
    if (!matrix[r.ym]) matrix[r.ym] = {};
    matrix[r.ym][r.provider] = { sales_count: r.sales_count, gross_cents: r.gross_cents };
  }

  res.json({ months, providers, matrix });
});

// POST /api/payment-providers/:id/test — smoke test das credenciais
router.post('/:id/test', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!registry.isSupported(id)) return res.status(404).json({ error: 'provider desconhecido' });
  if (!registry.isConfigured(id)) return res.status(400).json({ error: 'provider sem credenciais' });

  try {
    const connector = registry.instantiate(id);
    const r = await connector.testConnection();
    res.json({ ok: true, provider: id, ...r });
  } catch (e) {
    res.status(e.code === 'test_not_implemented' ? 501 : 400).json({
      ok: false, provider: id, error: e.message, code: e.code, status: e.status
    });
  }
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
