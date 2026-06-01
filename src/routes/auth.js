const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db, getCredential } = require('../db');
const { isAdmin, DEV_USER, bypassActive } = require('../middleware/auth');
const audit = require('../audit');

const router = express.Router();

passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

// ---------- HELPERS ----------
function countUsers() { return db.prepare('SELECT COUNT(*) AS c FROM users WHERE active=1').get().c; }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''); }
function sanitizeUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, role: u.role, discord_id: u.discord_id, discord_tag: u.discord_tag, discord_avatar: u.discord_avatar, display_name: u.display_name };
}

const loginLimiter = rateLimit({ windowMs: 60_000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'muitas tentativas, espere 1 min' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'limite de registros por hora atingido' } });

// ---------- REGISTRO ----------
router.post('/register', registerLimiter, async (req, res) => {
  const { email, password, display_name } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'email invalido' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'senha deve ter pelo menos 8 caracteres' });

  if (db.prepare('SELECT id FROM users WHERE email=?').get(cleanEmail)) {
    return res.status(400).json({ error: 'email ja cadastrado' });
  }

  const isFirst = countUsers() === 0;
  const role = isFirst ? 'owner' : 'admin';
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, role, display_name, last_login_at)
    VALUES (?, ?, ?, ?, strftime('%s','now'))
  `).run(cleanEmail, hash, role, display_name || cleanEmail.split('@')[0]);

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  req.session.userId = user.id;
  audit.log({ req, action: 'user.register', target_type: 'user', target_id: user.id, details: { role } });
  res.json({ ok: true, user: sanitizeUser(user), is_first: isFirst });
});

// ---------- LOGIN EMAIL/SENHA ----------
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return res.status(400).json({ error: 'email e senha obrigatorios' });

  const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(cleanEmail);
  if (!user || !user.password_hash) {
    await bcrypt.hash('dummy', 10).catch(() => {}); // timing fix
    return res.status(401).json({ error: 'credenciais invalidas' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais invalidas' });

  db.prepare(`UPDATE users SET last_login_at=strftime('%s','now') WHERE id=?`).run(user.id);
  req.session.userId = user.id;
  audit.log({ req, action: 'user.login', target_type: 'user', target_id: user.id });
  res.json({ ok: true, user: sanitizeUser(user) });
});

// ---------- TROCAR SENHA ----------
router.put('/password', async (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'nova senha deve ter pelo menos 8 caracteres' });

  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.appUser.id);
  if (u.password_hash) {
    const ok = await bcrypt.compare(current_password || '', u.password_hash);
    if (!ok) return res.status(401).json({ error: 'senha atual incorreta' });
  }
  const hash = await bcrypt.hash(new_password, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, u.id);
  audit.log({ req, action: 'user.password_changed', target_type: 'user', target_id: u.id });
  res.json({ ok: true });
});

// ---------- DISCORD OAUTH (segue funcionando) ----------
let _registeredKey = null;
function ensureDiscordStrategy() {
  const clientID = getCredential('DISCORD_CLIENT_ID');
  const clientSecret = getCredential('DISCORD_CLIENT_SECRET');
  if (!clientID || !clientSecret) return false;
  const key = `${clientID}::${clientSecret}::${process.env.PUBLIC_URL || ''}`;
  if (_registeredKey === key) return true;
  passport.unuse('discord');
  passport.use(new DiscordStrategy({
    clientID,
    clientSecret,
    callbackURL: (process.env.PUBLIC_URL || 'http://localhost:3000') + '/auth/discord/callback',
    scope: ['identify']
  }, (accessToken, refreshToken, profile, done) => {
    done(null, {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null
    });
  }));
  _registeredKey = key;
  return true;
}

router.get('/discord', (req, res, next) => {
  if (!ensureDiscordStrategy()) return res.redirect('/setup.html?missing=discord');
  passport.authenticate('discord')(req, res, next);
});

router.get('/discord/callback', (req, res, next) => {
  if (!ensureDiscordStrategy()) return res.redirect('/setup.html?missing=discord');
  passport.authenticate('discord', { failureRedirect: '/login.html?login=fail' })(req, res, () => {
    const { isAdmin: chk } = require('../middleware/auth');
    // O loadUser middleware vai auto-criar a conta no proximo request — aqui so redireciona.
    res.redirect('/app.html');
  });
});

router.post('/logout', (req, res) => {
  audit.log({ req, action: 'user.logout' });
  if (req.logout) req.logout(() => { req.session.destroy(() => res.json({ ok: true })); });
  else req.session.destroy(() => res.json({ ok: true }));
});

// ---------- ME ----------
router.get('/me', (req, res) => {
  if (bypassActive()) {
    return res.json({ authenticated: true, user: req.appUser || DEV_USER, admin: true, dev: true });
  }
  if (!req.appUser) {
    return res.json({ authenticated: false, has_users: countUsers() > 0 });
  }
  res.json({ authenticated: true, user: sanitizeUser(req.appUser), admin: isAdmin(req.appUser) });
});

// ---------- TIMES (lista usuarios + convidar) ----------
router.get('/users', (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  const rows = db.prepare('SELECT id,email,role,discord_id,discord_tag,display_name,active,created_at,last_login_at FROM users ORDER BY created_at').all();
  res.json(rows);
});

router.post('/invite', async (req, res) => {
  if (!req.appUser || req.appUser.role !== 'owner') return res.status(403).json({ error: 'apenas owner' });
  const { email, role } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'email invalido' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(cleanEmail)) return res.status(400).json({ error: 'email ja cadastrado' });

  const tempPwd = require('crypto').randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(tempPwd, 10);
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, role, display_name)
    VALUES (?, ?, ?, ?)
  `).run(cleanEmail, hash, ['admin', 'member'].includes(role) ? role : 'admin', cleanEmail.split('@')[0]);

  audit.log({ req, action: 'user.invited', target_type: 'user', target_id: info.lastInsertRowid, details: { email: cleanEmail, role } });
  res.json({ ok: true, email: cleanEmail, temporary_password: tempPwd });
});

router.delete('/users/:id', (req, res) => {
  if (!req.appUser || req.appUser.role !== 'owner') return res.status(403).json({ error: 'apenas owner' });
  if (parseInt(req.params.id) === req.appUser.id) return res.status(400).json({ error: 'voce nao pode remover voce mesmo' });
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'user.deactivated', target_type: 'user', target_id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
