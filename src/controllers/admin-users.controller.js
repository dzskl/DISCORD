// Painel admin GLOBAL — owner gerencia todos os users do BotDash.
// Diferente do team.controller que eh por guild.
//
// So owner acessa. Lista todos os users com stats consolidadas, permite
// editar role/plano/active, criar novos com senha, ver detalhe completo,
// desativar e remover acesso a paineis.

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database/connection');
const { requireOwner } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireOwner);

const VALID_ROLES = ['owner', 'admin', 'member'];
const VALID_PLANS = ['free', 'pro', 'trial_24h'];

// Lista todos os users com stats
router.get('/list', (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = req.query.role;
  const plan = req.query.plan;
  const active = req.query.active;

  const wheres = [];
  const args = [];
  if (q) {
    wheres.push('(u.email LIKE ? OR u.display_name LIKE ? OR u.discord_tag LIKE ? OR u.discord_id = ? OR CAST(u.id AS TEXT) = ?)');
    const like = `%${q}%`;
    args.push(like, like, like, q, q);
  }
  if (role && VALID_ROLES.includes(role)) { wheres.push('u.role = ?'); args.push(role); }
  if (plan && VALID_PLANS.includes(plan)) { wheres.push('u.plan = ?'); args.push(plan); }
  if (active === '0' || active === '1') { wheres.push('u.active = ?'); args.push(parseInt(active)); }

  const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      u.id, u.email, u.display_name, u.role, u.plan,
      u.discord_id, u.discord_tag, u.discord_avatar,
      u.subscription_status, u.trial_ends_at, u.subscription_ends_at,
      u.active, u.created_at, u.last_login_at,
      u.verified_badge_until, u.auto_withdraw_enabled,
      (SELECT COUNT(*) FROM user_guilds ug WHERE ug.user_id = u.id) AS guild_count,
      (SELECT COUNT(*) FROM sales s
        JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
        WHERE ug.user_id = u.id AND s.status='paid') AS paid_sales_count,
      (SELECT COALESCE(SUM(s.amount_cents),0) FROM sales s
        JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
        WHERE ug.user_id = u.id AND s.status='paid') AS total_gmv_cents,
      (SELECT COALESCE(SUM(COALESCE(s.platform_fee_cents,0) + COALESCE(s.platform_fixed_fee_cents,0)),0)
        FROM sales s
        JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
        WHERE ug.user_id = u.id AND s.status='paid') AS platform_revenue_cents
    FROM users u
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT 500
  `).all(...args);
  res.json(rows);
});

// Stats agregado pro topo do painel
router.get('/stats', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const d30 = now - 30 * 86400;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  const activeUsers = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE active=1`).get().c;
  const owners = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role='owner' AND active=1`).get().c;
  const admins = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role='admin' AND active=1`).get().c;
  const pro = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE plan='pro' AND active=1`).get().c;
  const newLast30d = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE created_at >= ?`).get(d30).c;
  const activeLast30d = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE last_login_at >= ?`).get(d30).c;
  res.json({ total, active: activeUsers, owners, admins, pro, new_last_30d: newLast30d, active_last_30d: activeLast30d });
});

// Detalhe de um user
router.get('/:id', (req, res) => {
  const u = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM user_guilds ug WHERE ug.user_id = u.id) AS guild_count
    FROM users u WHERE u.id=?
  `).get(req.params.id);
  if (!u) return res.status(404).json({ error: 'user nao encontrado' });
  delete u.password_hash;
  delete u.totp_secret;

  const guilds = db.prepare(`
    SELECT g.id, g.name, g.plan, ug.role, ug.added_at
    FROM user_guilds ug
    LEFT JOIN guilds g ON g.id = ug.guild_id
    WHERE ug.user_id = ?
  `).all(u.id);

  const recentSales = db.prepare(`
    SELECT s.id, s.amount_cents, s.status, s.created_at, p.name AS product_name
    FROM sales s
    LEFT JOIN products p ON p.id = s.product_id
    JOIN user_guilds ug ON ug.guild_id = s.guild_id AND ug.role='owner'
    WHERE ug.user_id = ?
    ORDER BY s.created_at DESC LIMIT 20
  `).all(u.id);

  const recentLogins = db.prepare(`
    SELECT created_at, details FROM audit_log
    WHERE user_id = ? AND action IN ('user.login','user.register')
    ORDER BY created_at DESC LIMIT 10
  `).all(u.id).map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));

  res.json({ user: u, guilds, recent_sales: recentSales, recent_logins: recentLogins });
});

// Atualiza role/plan/active
router.put('/:id', (req, res) => {
  const { role, plan, active, display_name, subscription_status } = req.body || {};
  const target = db.prepare('SELECT id, role FROM users WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'user nao encontrado' });

  // Owner nao pode rebaixar o proprio role (proteção)
  if (req.appUser.id === target.id && role && role !== 'owner') {
    return res.status(400).json({ error: 'voce nao pode rebaixar o proprio role' });
  }

  const updates = [];
  const args = [];
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role invalido' });
    updates.push('role = ?'); args.push(role);
  }
  if (plan !== undefined) {
    if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'plan invalido' });
    updates.push('plan = ?'); args.push(plan);
  }
  if (active !== undefined) {
    updates.push('active = ?'); args.push(active ? 1 : 0);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?'); args.push(String(display_name).slice(0, 120));
  }
  if (subscription_status !== undefined) {
    updates.push('subscription_status = ?'); args.push(subscription_status || null);
  }
  if (!updates.length) return res.status(400).json({ error: 'nenhum campo pra atualizar' });

  args.push(target.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...args);
  audit.log({ req, action: 'admin.user.update', target_id: target.id, details: { role, plan, active, subscription_status } });
  res.json({ ok: true });
});

// Cria um user novo (com senha temporaria)
router.post('/', async (req, res) => {
  const { email, display_name, role, plan, password, discord_id } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email obrigatorio' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email invalido' });
  if (!VALID_ROLES.includes(role || 'admin')) return res.status(400).json({ error: 'role invalido' });
  if (!VALID_PLANS.includes(plan || 'free')) return res.status(400).json({ error: 'plan invalido' });

  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'email ja cadastrado' });

  const pw = password || (Math.random().toString(36).slice(-10));
  const hash = await bcrypt.hash(pw, 10);

  const info = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, role, plan, discord_id, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    email.toLowerCase(),
    hash,
    display_name || email.split('@')[0],
    role || 'admin',
    plan || 'free',
    discord_id || null
  );

  audit.log({ req, action: 'admin.user.create', target_id: info.lastInsertRowid, details: { email, role, plan } });
  res.json({ ok: true, id: info.lastInsertRowid, temp_password: password ? undefined : pw });
});

// Reset de senha — gera nova senha temporaria
router.post('/:id/reset-password', async (req, res) => {
  const target = db.prepare('SELECT id, email FROM users WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'user nao encontrado' });
  const pw = Math.random().toString(36).slice(-12);
  const hash = await bcrypt.hash(pw, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, target.id);
  audit.log({ req, action: 'admin.user.reset_password', target_id: target.id });
  res.json({ ok: true, temp_password: pw });
});

// Da/remove acesso a uma guild especifica
router.post('/:id/guilds/:guildId', (req, res) => {
  const { role } = req.body || {};
  const r = ['owner', 'admin', 'member'].includes(role) ? role : 'member';
  db.prepare(`
    INSERT INTO user_guilds (user_id, guild_id, role) VALUES (?,?,?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET role=excluded.role
  `).run(req.params.id, req.params.guildId, r);
  audit.log({ req, action: 'admin.user.grant_guild', target_id: req.params.id, details: { guild_id: req.params.guildId, role: r } });
  res.json({ ok: true });
});

router.delete('/:id/guilds/:guildId', (req, res) => {
  db.prepare(`DELETE FROM user_guilds WHERE user_id=? AND guild_id=?`).run(req.params.id, req.params.guildId);
  audit.log({ req, action: 'admin.user.revoke_guild', target_id: req.params.id, details: { guild_id: req.params.guildId } });
  res.json({ ok: true });
});

// Desativa (soft delete) — preserva auditoria
router.delete('/:id', (req, res) => {
  if (req.appUser.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: 'voce nao pode desativar a propria conta' });
  }
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'admin.user.deactivate', target_id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
