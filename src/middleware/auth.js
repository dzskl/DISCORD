function getAdmins() {
  return (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

function isAdmin(user) {
  if (!user) return false;
  const admins = getAdmins();
  if (admins.length === 0) return true;
  return admins.includes(user.id);
}

const DEV_USER = { id: 'dev', username: 'dev', discriminator: '0000', avatar: null, _dev: true };

function bypassActive() {
  return process.env.DEV_BYPASS_AUTH === '1' && process.env.NODE_ENV !== 'production';
}

function requireAuth(req, res, next) {
  if (bypassActive()) { req.user = req.user || DEV_USER; return next(); }
  if (!req.user) return res.status(401).json({ error: 'nao autenticado' });
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'sem permissao' });
  next();
}

module.exports = { requireAuth, isAdmin, bypassActive, DEV_USER };
