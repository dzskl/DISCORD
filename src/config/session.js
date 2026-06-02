// Configuracao de sessao Express.
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { SESSION_MAX_AGE_MS } = require('../constants');

module.exports = function buildSession() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const isProd = process.env.NODE_ENV === 'production';
  return session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
    secret: process.env.SESSION_SECRET || 'troque-isto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd
    }
  });
};
