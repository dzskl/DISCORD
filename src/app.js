// Construcao do app Express.
// Responsavel SO pela montagem dos middlewares + rotas.
// Lifecycle (boot, bot, scheduler) fica em server.js.

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');

const logging = require('./middlewares/logging.middleware');
const errorHandler = require('./middlewares/error-handler.middleware');
const buildSession = require('./config/session');
const limits = require('./config/rate-limits');
const routes = require('./routes');
const { loadUser } = require('./middlewares/auth.middleware');
const { resolveGuild } = require('./middlewares/guild.middleware');

function buildApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.TRUST_PROXY === '1' || isProd) app.set('trust proxy', 1);

  app.use(logging);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(require('./middlewares/request-id.middleware').requestIdMiddleware);
  app.use(require('./services/graceful-shutdown.service').shutdownMiddleware);
  app.use(cors({ origin: true, credentials: true }));

  // === RAW BODY ROUTES (webhooks Stripe) — ANTES do express.json ===
  // Os webhooks precisam do raw body pra validar a signature.
  app.use('/api/checkout/webhook', require('./controllers/checkout.controller'));
  app.use('/api/checkout/pix', require('./controllers/checkout_misticpay.controller'));
  app.use('/api/billing/webhook', require('./controllers/billing.controller'));

  // Webhooks dos providers do Wallet (MercadoPago / PushinPay / NOWPayments).
  // Aceitam JSON (cada connector valida HMAC sobre req.body ja parseado).
  app.use('/webhooks/wallet', require('./controllers/wallet-webhook.controller'));

  // === BODY PARSING ===
  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: true, limit: '128kb' }));

  // === RATE LIMITS ===
  app.use('/auth/login', limits.login);
  app.use('/auth/register', limits.register);
  app.use('/auth/forgot', limits.forgot);
  app.use('/auth', limits.auth);
  app.use('/api/checkout/create-session', limits.checkout);
  app.use('/api/checkout/pix/create', limits.checkout);
  app.use('/api/checkout/wallet/create', limits.checkout);
  app.use('/api/coupons/validate', limits.coupon);
  app.use('/api/', limits.api);

  // === RATE LIMIT POR TENANT (anti-abuse por vendedor) ===
  const { tenantLimiter } = require('./middlewares/tenant-rate-limit.middleware');
  // Por guild: 60 checkouts/min, 30 criacoes de produto/min
  app.use('/api/checkout/pix/create', tenantLimiter({ scope: 'guild', capacity: 60, windowMs: 60_000 }));
  app.use('/api/checkout/create-session', tenantLimiter({ scope: 'guild', capacity: 60, windowMs: 60_000 }));
  app.use('/api/checkout/wallet/create', tenantLimiter({ scope: 'guild', capacity: 60, windowMs: 60_000 }));
  // API publica via Bearer key: peek populando req.apiKey antes do limiter
  const { peekApiKey } = require('./middlewares/api-key.middleware');
  const { versionMiddleware } = require('./middlewares/api-version.middleware');
  app.use('/api/checkout/wallet', versionMiddleware);
  app.use('/api/checkout/wallet/sales', peekApiKey, tenantLimiter({ scope: 'api_key', capacity: 120, windowMs: 60_000, route: 'wallet:sales' }));
  app.use('/api/checkout/wallet/refund', peekApiKey, tenantLimiter({ scope: 'api_key', capacity: 30, windowMs: 60_000, route: 'wallet:refund' }));
  app.use('/api/products', tenantLimiter({ scope: 'guild', capacity: 30, windowMs: 60_000 }));
  // Por user: 10 saques/min, 5 antecipacoes/min
  app.use('/api/wallet/withdraw', tenantLimiter({ scope: 'user', capacity: 10, windowMs: 60_000 }));
  app.use('/api/wallet/advance/execute', tenantLimiter({ scope: 'user', capacity: 5, windowMs: 60_000 }));

  // === SESSION + AUTH ===
  app.use(buildSession());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(loadUser);
  app.use(resolveGuild);

  // === ROTAS ===
  routes.register(app);

  // === GATE: /admin/ exige super-admin (exceto login + auth) ===
  app.use('/admin', (req, res, next) => {
    // Sempre liberadas (sem auth)
    const open = ['/login.html', '/login', '/auth/', '/api/auth/'];
    if (open.some(p => req.path === p || req.path.startsWith(p))) return next();
    // Bypass DEV
    if (process.env.DEV_BYPASS_AUTH === '1' && process.env.NODE_ENV !== 'production') return next();
    const { isSuperAdmin } = require('./middlewares/auth.middleware');
    if (!req.appUser) return res.redirect('/admin/login.html');
    if (!isSuperAdmin(req.appUser)) return res.redirect('/admin/login.html?err=not_authorized');
    next();
  });

  // === ARQUIVOS ESTATICOS ===
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // === ERROR HANDLER ===
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
