const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');

const checkoutRouter = require('./routes/checkout');

function buildApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));

  // Webhook do Stripe precisa do raw body — registra ANTES do express.json
  app.use('/api/checkout/webhook', checkoutRouter);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const dataDir = path.join(__dirname, '..', 'data');
  app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
    secret: process.env.SESSION_SECRET || 'troque-isto',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
  }));
  app.use(passport.initialize());
  app.use(passport.session());

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
  app.use('/api/checkout', checkoutRouter);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    console.error('[ERR]', err);
    res.status(500).json({ error: err.message });
  });

  return app;
}

module.exports = { buildApp };
