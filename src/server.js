const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const pinoHttp = require('pino-http');

const logger = require('./logger');
const checkoutRouter = require('./routes/checkout');

function buildApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.TRUST_PROXY === '1' || isProd) app.set('trust proxy', 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: req => req.url.startsWith('/api/checkout/webhook') } }));

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({ origin: true, credentials: true }));

  // Webhook do Stripe precisa do raw body — registra ANTES do express.json
  app.use('/api/checkout/webhook', checkoutRouter);

  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: true, limit: '128kb' }));

  const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
  const checkoutLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
  const couponLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'muitas tentativas, tente em 1 min' } });
  const authLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

  app.use('/auth', authLimiter);
  app.use('/api/checkout/create-session', checkoutLimiter);
  app.use('/api/coupons/validate', couponLimiter);
  app.use('/api/', apiLimiter);

  const dataDir = path.join(__dirname, '..', 'data');
  app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
    secret: process.env.SESSION_SECRET || 'troque-isto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd
    }
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api/setup', require('./routes/setup'));
  app.use('/auth', require('./routes/auth'));
  app.use('/api/stats', require('./routes/stats'));
  app.use('/api/members', require('./routes/members'));
  app.use('/api/logs', require('./routes/logs'));
  app.use('/api/mod', require('./routes/mod'));
  app.use('/api/products', require('./routes/products'));
  app.use('/api/sales', require('./routes/sales'));
  app.use('/api/announcements', require('./routes/announcements'));
  app.use('/api/config', require('./routes/config'));
  app.use('/api/coupons', require('./routes/coupons'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/auto-replies', require('./routes/auto_replies'));
  app.use('/api/wishlist', require('./routes/wishlist'));
  app.use('/api/tickets', require('./routes/tickets'));
  app.use('/api/categories', require('./routes/categories'));
  app.use('/api/giveaways', require('./routes/giveaways'));
  app.use('/api/audit', require('./routes/audit'));
  app.use('/api/affiliates', require('./routes/affiliates'));
  app.use('/api/invites', require('./routes/invites'));
  app.use('/api/checkout', checkoutRouter);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    logger.error({ err, url: req.url }, 'request failed');
    const isClient = err.status && err.status >= 400 && err.status < 500;
    const safeMsg = isClient || !isProd ? err.message : 'erro interno';
    res.status(err.status || 500).json({ error: safeMsg });
  });

  return app;
}

module.exports = { buildApp };
