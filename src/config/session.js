// Configuracao de sessao Express com persistencia em SQLite.
//
// IMPORTANTE: o arquivo sessions.sqlite vive em /app/data. Pra sessoes
// sobreviverem entre deploys no Railway, precisa adicionar um VOLUME
// montado em /app/data (Railway > Settings > Volumes > Add Volume).
// Sem volume, todo mundo desloga a cada deploy.

const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const logger = require('../utils/logger');

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

module.exports = function buildSession() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 16 || secret === 'troque-isto-por-uma-string-aleatoria-longa') {
    logger.warn('SESSION_SECRET fraco/ausente — sessoes serao invalidadas em cada reboot. Configure uma string aleatoria de 32+ caracteres.');
  }

  return session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir, concurrentDB: true }),
    secret: secret || 'troque-isto-INSEGURO-' + Date.now(),
    resave: false,
    saveUninitialized: false,
    rolling: true, // ★ renova maxAge a cada request — sessao nao expira enquanto user usar
    name: 'botdash.sid',
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd
    }
  });
};
