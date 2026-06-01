const { db, getCredential } = require('../db');

const DEV_USER = { id: 'dev', username: 'dev', email: 'dev@local', role: 'owner', _dev: true };

function bypassActive() {
  return process.env.DEV_BYPASS_AUTH === '1' && process.env.NODE_ENV !== 'production';
}

function getAdminDiscordIds() {
  return (getCredential('ADMIN_DISCORD_IDS') || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

// Carrega usuario do session.userId (email/senha) OU mapeia o req.user do passport
// (Discord) pra um user da tabela. Coloca o resultado em req.appUser.
function loadUser(req, res, next) {
  if (bypassActive() && !req.appUser) req.appUser = DEV_USER;

  // sessao tradicional (email/senha)
  if (req.session?.userId) {
    const u = db.prepare('SELECT id,email,role,discord_id,discord_tag,discord_avatar,display_name,active FROM users WHERE id=?').get(req.session.userId);
    if (u && u.active) req.appUser = u;
  }

  // sessao Discord OAuth via passport
  if (!req.appUser && req.user?.id) {
    let u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(req.user.id);
    if (!u && getAdminDiscordIds().includes(req.user.id)) {
      // auto-cria conta pra admin Discord (compat com setup antigo)
      const info = db.prepare(`
        INSERT INTO users (email, discord_id, discord_tag, discord_avatar, display_name, role)
        VALUES (?, ?, ?, ?, ?, 'owner')
      `).run(`discord-${req.user.id}@local`, req.user.id, req.user.username || null, req.user.avatar || null, req.user.username || null);
      u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    }
    if (u && u.active) req.appUser = u;
  }

  next();
}

function isAdmin(user) {
  if (!user) return false;
  if (user._dev) return true;
  return ['owner', 'admin'].includes(user.role);
}

function requireAuth(req, res, next) {
  if (bypassActive()) { req.appUser = req.appUser || DEV_USER; return next(); }
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  if (!isAdmin(req.appUser)) return res.status(403).json({ error: 'sem permissao' });
  // expoe req.user pra audit/etc usar
  if (!req.user) req.user = { id: req.appUser.discord_id || String(req.appUser.id), username: req.appUser.display_name || req.appUser.email };
  next();
}

function requireOwner(req, res, next) {
  if (bypassActive()) return next();
  if (!req.appUser || req.appUser.role !== 'owner') return res.status(403).json({ error: 'apenas owner' });
  next();
}

module.exports = { requireAuth, requireOwner, loadUser, isAdmin, bypassActive, DEV_USER };
