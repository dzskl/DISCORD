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

function buildApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.TRUST_PROXY === '1' || isProd) app.set('trust proxy', 1);

  app.use(logging);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));

  // === RAW BODY ROUTES (webhooks Stripe) — ANTES do express.json ===
  // Os webhooks precisam do raw body pra validar a signature.
  app.use('/api/checkout/webhook', require('./controllers/checkout.controller'));
  app.use('/api/checkout/pix', require('./controllers/checkout_misticpay.controller'));
  app.use('/api/billing/webhook', require('./controllers/billing.controller'));

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
  app.use('/api/coupons/validate', limits.coupon);
  app.use('/api/', limits.api);

  // === SESSION + AUTH ===
  app.use(buildSession());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(loadUser);

  // === ROTAS ===
  routes.register(app);

  // === ARQUIVOS ESTATICOS ===
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // === ERROR HANDLER ===
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
