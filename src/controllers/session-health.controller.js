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

  // Discord OAuth credentials (no DB)
  let discord = { client_id: false, client_secret: false };
  try {
    const { getCredential } = require('../database/connection');
    discord = {
      client_id: !!getCredential('DISCORD_CLIENT_ID'),
      client_secret: !!getCredential('DISCORD_CLIENT_SECRET'),
      bot_token: !!getCredential('DISCORD_TOKEN') || !!getCredential('DISCORD_BOT_TOKEN')
    };
  } catch {}

  // Detecta se o Railway tem volume
  let volume = null;
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    volume = { railway: true, path: process.env.RAILWAY_VOLUME_MOUNT_PATH };
  } else if (process.env.NODE_ENV === 'production') {
    volume = { railway: false, warning: 'Sem RAILWAY_VOLUME_MOUNT_PATH em prod — DB pode zerar a cada deploy' };
  } else {
    volume = { railway: false, dev: true };
  }

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
      will_survive_deploy: !!process.env.RAILWAY_VOLUME_MOUNT_PATH
    },
    main_db: { file: mainDbFile, users_active: usersCount },
    session_secret: secretInfo,
    discord_oauth: discord,
    volume,
    public_url: process.env.PUBLIC_URL || null,
    env: process.env.NODE_ENV || 'development',
    advice: buildAdvice(secretInfo, sessionFile, discord, usersCount)
  });
});

function buildAdvice(secretInfo, sessionFile, discord, usersCount) {
  const issues = [];
  if (process.env.NODE_ENV === 'production' && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    issues.push({
      level: 'critical',
      title: 'Sem Volume persistente no Railway',
      message: 'O DB esta em /app/data SEM volume — toda vez que voce der deploy, perde tudo (users, sessoes, credenciais).',
      fix: 'Railway > Settings > Volumes > Add Volume > monte em /app/data'
    });
  }
  if (!secretInfo.set) {
    issues.push({
      level: 'critical',
      title: 'SESSION_SECRET nao definido',
      message: 'Sessoes morrem a cada reboot do servidor.',
      fix: 'Railway > Variables > adicione SESSION_SECRET com string aleatoria de 32+ caracteres'
    });
  } else if (secretInfo.is_placeholder) {
    issues.push({ level: 'critical', title: 'SESSION_SECRET ainda eh placeholder', fix: 'Troque por string aleatoria' });
  } else if (!secretInfo.strong) {
    issues.push({ level: 'warn', title: 'SESSION_SECRET muito curto', message: 'Use 32+ caracteres', fix: 'Gere com: openssl rand -hex 32' });
  }
  if (!discord.client_id || !discord.client_secret) {
    issues.push({
      level: 'warn',
      title: 'Discord OAuth nao configurado',
      message: 'Login com Discord nao vai funcionar sem DISCORD_CLIENT_ID/SECRET nas credenciais.',
      fix: 'Acesse /setup.html ou /app.html#credenciais e cole os valores do Discord Developer Portal'
    });
  }
  if (usersCount === 0) {
    issues.push({
      level: 'info',
      title: 'Nenhum usuario cadastrado',
      message: 'A 1a pessoa que se cadastrar vira owner. Se isso aparece pra TODO MUNDO mesmo apos cadastro, o DB esta sendo zerado.',
      fix: 'Configure Volume no Railway (item critico acima)'
    });
  }
  if (!sessionFile.exists) {
    issues.push({ level: 'info', title: 'sessions.sqlite nao existe ainda', message: 'Esperado se nunca ninguem fez login.' });
  }
  return issues.length ? issues : [{ level: 'ok', title: 'Tudo OK', message: 'Configuracao saudavel.' }];
}

module.exports = router;
