// Diagnostico de sessao — ajuda a debugar logout entre deploys.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { db } = require('../database/connection');

const router = express.Router();

router.get('/health', (req, res) => {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const sessionsDb = path.join(dataDir, 'sessions.sqlite');
  const mainDb = path.join(dataDir, 'botdash.sqlite');

  let sessionFile = null;
  try {
    const stat = fs.statSync(sessionsDb);
    sessionFile = {
      exists: true,
      size_kb: Math.round(stat.size / 1024),
      modified: stat.mtime.toISOString()
    };
  } catch { sessionFile = { exists: false }; }

  let mainDbFile = null;
  try {
    const stat = fs.statSync(mainDb);
    mainDbFile = {
      exists: true,
      size_kb: Math.round(stat.size / 1024),
      modified: stat.mtime.toISOString()
    };
  } catch { mainDbFile = { exists: false }; }

  const usersCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE active=1').get().c;
  const sessionsCount = (() => {
    try {
      const Database = require('better-sqlite3');
      const sdb = new Database(sessionsDb, { readonly: true, fileMustExist: true });
      const r = sdb.prepare('SELECT COUNT(*) AS c FROM sessions').get();
      sdb.close();
      return r.c;
    } catch { return null; }
  })();

  const secret = process.env.SESSION_SECRET || '';
  const secretInfo = {
    set: !!process.env.SESSION_SECRET,
    length: secret.length,
    strong: secret.length >= 32,
    is_placeholder: secret === 'troque-isto-por-uma-string-aleatoria-longa'
  };

  res.json({
    your_session: {
      authenticated: !!req.appUser,
      session_id_present: !!req.sessionID,
      user_id_in_session: req.session?.userId || null,
      cookie_expires: req.session?.cookie?.expires || null
    },
    session_storage: {
      file: sessionFile,
      total_sessions: sessionsCount,
      will_survive_deploy: process.env.RAILWAY_VOLUME_MOUNT_PATH ? true : 'verifique se ha volume em /app/data'
    },
    main_db: { file: mainDbFile, users_active: usersCount },
    session_secret: secretInfo,
    advice: buildAdvice(secretInfo, sessionFile)
  });
});

function buildAdvice(secretInfo, sessionFile) {
  const issues = [];
  if (!secretInfo.set) issues.push('SESSION_SECRET nao definido — sessoes morrem a cada deploy');
  else if (secretInfo.is_placeholder) issues.push('SESSION_SECRET ainda eh o placeholder do .env.example — troque por uma string aleatoria');
  else if (!secretInfo.strong) issues.push('SESSION_SECRET muito curto — use 32+ caracteres aleatorios');
  if (!sessionFile.exists) issues.push('sessions.sqlite nao existe — esperado se ainda nao houve login');
  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.NODE_ENV === 'production') {
    issues.push('Nao detectei volume persistente do Railway. Adicione um Volume em /app/data pra sessoes sobreviverem entre deploys.');
  }
  return issues.length ? issues : ['tudo OK'];
}

module.exports = router;
