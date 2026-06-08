const { db, getCredential } = require('../database/connection');

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
    const u = db.prepare('SELECT id,email,role,discord_id,discord_tag,discord_avatar,display_name,active,is_super_admin FROM users WHERE id=?').get(req.session.userId);
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

  // Bootstrap automatico de super-admin via env (so na 1a vez)
  if (req.appUser && !req.appUser.is_super_admin) {
    maybePromoteToSuperAdmin(req.appUser);
  }

  next();
}

function isAdmin(user) {
  if (!user) return false;
  if (user._dev) return true;
  return ['owner', 'admin'].includes(user.role);
}

// Super admin = donos da plataforma BotDash.
// Defaults hardcoded + extras via env.
const DEFAULT_SUPER_ADMIN_DISCORD_IDS = [
  '949815058848956568',
  '741815717661507744'
];

function superAdminAllowlist() {
  const emails = (process.env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const envDids = (process.env.SUPER_ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Merge sem duplicar
  const dids = Array.from(new Set([...DEFAULT_SUPER_ADMIN_DISCORD_IDS, ...envDids]));
  return { emails, dids };
}

function isSuperAdmin(user) {
  if (!user) return false;
  if (user._dev) return true;
  if (user.is_super_admin) return true;
  const { emails, dids } = superAdminAllowlist();
  if (user.email && emails.includes(String(user.email).toLowerCase())) return true;
  if (user.discord_id && dids.includes(String(user.discord_id))) return true;
  return false;
}

// Promove o user automaticamente:
// 1) Se bate na allowlist do env (SUPER_ADMIN_EMAILS / SUPER_ADMIN_DISCORD_IDS)
// 2) BOOTSTRAP: se nao ha nenhum super-admin no DB E nenhuma allowlist no env,
//    o primeiro user com role='owner' que aparecer vira o 1o super-admin.
function maybePromoteToSuperAdmin(user) {
  if (!user || user.is_super_admin) return;
  try {
    const { db } = require('../database/connection');
    const { emails, dids } = superAdminAllowlist();
    let shouldPromote = isSuperAdmin(user);

    if (!shouldPromote && user.role === 'owner' && emails.length === 0 && dids.length === 0) {
      const existing = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_super_admin=1 AND active=1').get().c;
      if (existing === 0) shouldPromote = true; // bootstrap automatico
    }

    if (shouldPromote) {
      db.prepare('UPDATE users SET is_super_admin=1 WHERE id=?').run(user.id);
      user.is_super_admin = 1;
    }
  } catch {}
}

function requireSuperAdmin(req, res, next) {
  if (bypassActive()) { req.appUser = req.appUser || DEV_USER; return next(); }
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado', super_admin_required: true });
  if (!isSuperAdmin(req.appUser)) return res.status(403).json({ error: 'apenas super-admin', super_admin_required: true });
  next();
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

module.exports = { requireAuth, requireOwner, requireSuperAdmin, loadUser, isAdmin, isSuperAdmin, maybePromoteToSuperAdmin, superAdminAllowlist, bypassActive, DEV_USER };
