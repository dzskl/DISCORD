// Painel /admin/ — exclusivo dos donos da plataforma BotDash (super-admin).
// Login proprio via /admin/auth/login (email/senha) ou /admin/auth/discord.
// Sessao compartilhada com /app.html, mas o acesso a /admin/ requer is_super_admin.

const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { db, getCredential } = require('../database/connection');
const { isSuperAdmin, maybePromoteToSuperAdmin, requireSuperAdmin, superAdminAllowlist } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 60_000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'muitas tentativas, espere 1 min' } });

// ---------- AUTH ----------
// URLs que precisam estar registradas no Discord Developer Portal
// (publico, pro user conseguir copiar se nao consegue logar)
router.get('/auth/discord-config', (req, res) => {
  const authCtrl = require('./auth.controller');
  const base = authCtrl.detectBaseUrl(req);
  res.json({
    detected_base_url: base,
    public_url_env: process.env.PUBLIC_URL || null,
    public_url_is_placeholder: /seu-dominio|example\.com|localhost/i.test(process.env.PUBLIC_URL || ''),
    callback_urls_to_register: [
      base + '/auth/discord/callback',
      base + '/admin/auth/discord/callback'
    ],
    note: 'Cole AMBAS as URLs em Discord Developer Portal > OAuth2 > Redirects',
    discord_client_id_configured: !!getCredential('DISCORD_CLIENT_ID')
  });
});

// Status do usuario logado: e super-admin? quem?
router.get('/auth/me', (req, res) => {
  if (!req.appUser) return res.json({ authenticated: false, super_admin: false });
  const sa = isSuperAdmin(req.appUser);
  res.json({
    authenticated: true,
    super_admin: sa,
    user: sa ? {
      id: req.appUser.id,
      email: req.appUser.email,
      display_name: req.appUser.display_name,
      discord_id: req.appUser.discord_id,
      discord_tag: req.appUser.discord_tag,
      discord_avatar: req.appUser.discord_avatar
    } : { id: req.appUser.id }
  });
});

// Login por email/senha — gate adicional: precisa ser super-admin
router.post('/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e senha obrigatorios' });

  const u = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(email).toLowerCase().trim());
  if (!u || !u.password_hash) return res.status(401).json({ error: 'credenciais invalidas' });

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais invalidas' });

  // Gate: so super-admin entra aqui
  maybePromoteToSuperAdmin(u);
  if (!isSuperAdmin(u)) {
    audit.log({ req, action: 'admin_panel.login_denied', target_id: u.id });
    return res.status(403).json({ error: 'acesso negado — esse painel e exclusivo dos donos da plataforma' });
  }

  // Salva sessao
  req.session.userId = u.id;
  // Mata sessao passport (oauth Discord) eventual pra evitar mismatch
  if (req.logout) try { req.logout(() => {}); } catch {}
  db.prepare('UPDATE users SET last_login_at=strftime(\'%s\',\'now\') WHERE id=?').run(u.id);
  audit.log({ req, action: 'admin_panel.login', target_id: u.id });

  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'falha ao salvar sessao' });
    res.json({ ok: true, redirect: '/admin/' });
  });
});

// Discord OAuth para super-admin (reusa a strategy ja registrada em auth.controller)
router.get('/auth/discord', (req, res, next) => {
  const authCtrl = require('./auth.controller');
  if (!authCtrl.ensureDiscordStrategy || !authCtrl.ensureDiscordStrategy(req)) {
    return res.redirect('/admin/login.html?err=no_discord');
  }
  req.session.admin_oauth_flow = 1;
  const callbackURL = authCtrl.detectBaseUrl(req) + '/admin/auth/discord/callback';
  passport.authenticate('discord', { callbackURL })(req, res, next);
});

// Callback dedicado pro admin — checa allowlist
router.get('/auth/discord/callback', (req, res, next) => {
  const fail = (r) => res.redirect('/admin/login.html?err=' + encodeURIComponent(r));
  if (req.query.error) return fail(req.query.error);

  // Garante strategy registrada (req pode chegar antes de qualquer call em /auth/discord)
  const authCtrl = require('./auth.controller');
  if (!authCtrl.ensureDiscordStrategy || !authCtrl.ensureDiscordStrategy(req)) {
    return fail('no_discord');
  }

  const callbackURL = authCtrl.detectBaseUrl(req) + '/admin/auth/discord/callback';
  passport.authenticate('discord', { callbackURL, failureRedirect: '/admin/login.html?err=auth_failed' })(req, res, () => {
    try {
      const profile = req.user;
      if (!profile?.id) return fail('no_profile');

      let user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(profile.id);
      if (!user) {
        // Verifica se esta na allowlist antes de criar
        const { dids } = superAdminAllowlist();
        if (!dids.includes(String(profile.id))) {
          audit.log({ req, action: 'admin_panel.discord_unauthorized', details: { discord_id: profile.id, tag: profile.username } });
          return fail('not_allowlisted');
        }
        // Cria conta de super-admin
        const info = db.prepare(`
          INSERT INTO users (email, discord_id, discord_tag, discord_avatar, display_name, role, is_super_admin, active, last_login_at)
          VALUES (?, ?, ?, ?, ?, 'owner', 1, 1, strftime('%s','now'))
        `).run(
          `discord-${profile.id}@bot.local`,
          profile.id, profile.username || null, profile.avatar || null, profile.username || profile.id
        );
        user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
        audit.log({ req, action: 'admin_panel.super_admin_created', target_id: user.id, details: { discord_id: profile.id } });
      } else {
        // Atualiza dados e promove se elegivel
        db.prepare(`
          UPDATE users SET discord_tag = COALESCE(?, discord_tag),
                           discord_avatar = COALESCE(?, discord_avatar),
                           last_login_at = strftime('%s','now')
          WHERE id = ?
        `).run(profile.username || null, profile.avatar || null, user.id);
        maybePromoteToSuperAdmin(user);
      }

      if (!user.active) return fail('inactive');
      if (!isSuperAdmin(user)) {
        audit.log({ req, action: 'admin_panel.login_denied', target_id: user.id, details: { via: 'discord' } });
        return fail('not_authorized');
      }

      req.session.userId = user.id;
      delete req.session.admin_oauth_flow;
      audit.log({ req, action: 'admin_panel.login', target_id: user.id, details: { via: 'discord' } });
      req.session.save((err) => {
        if (err) return fail('session_save');
        res.redirect('/admin/');
      });
    } catch (e) {
      require('../utils/logger').error({ err: e.message, stack: e.stack }, 'erro no callback discord admin');
      fail(e.message.slice(0, 60));
    }
  });
});

router.post('/auth/logout', (req, res) => {
  audit.log({ req, action: 'admin_panel.logout' });
  if (req.logout) req.logout(() => req.session.destroy(() => res.json({ ok: true })));
  else req.session.destroy(() => res.json({ ok: true }));
});

// ---------- ENDPOINTS GATED (prefixados com /api/) ----------
router.use('/api', requireSuperAdmin);

// Overview consolidado pro dashboard
router.get('/api/overview', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const d30 = now - 30 * 86400;
  const d7  = now - 7 * 86400;

  // Plataforma
  const userTotal = db.prepare('SELECT COUNT(*) AS c FROM users WHERE active=1').get().c;
  const userPro   = db.prepare("SELECT COUNT(*) AS c FROM users WHERE plan='pro' AND active=1").get().c;
  const userNew30 = db.prepare('SELECT COUNT(*) AS c FROM users WHERE created_at >= ?').get(d30).c;
  const userActive7 = db.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at >= ?').get(d7).c;

  // GMV e receita
  const grossAll = db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid'").get().v;
  const gross30  = db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ?").get(d30).v;
  const revAll = db.prepare(`SELECT
    COALESCE(SUM(platform_fee_cents),0) AS pc,
    COALESCE(SUM(COALESCE(platform_fixed_fee_cents,0)),0) AS fx
    FROM sales WHERE status='paid'`).get();
  const rev30 = db.prepare(`SELECT
    COALESCE(SUM(platform_fee_cents),0) AS pc,
    COALESCE(SUM(COALESCE(platform_fixed_fee_cents,0)),0) AS fx
    FROM sales WHERE status='paid' AND paid_at >= ?`).get(d30);

  let advAll = 0, adv30 = 0, featAll = 0, feat30 = 0, badgeAll = 0, badge30 = 0;
  try {
    advAll = db.prepare("SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE status='applied'").get().v;
    adv30  = db.prepare("SELECT COALESCE(SUM(fee_cents),0) AS v FROM advance_requests WHERE status='applied' AND created_at >= ?").get(d30).v;
  } catch {}
  try {
    featAll = db.prepare("SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE paid_via='balance' AND status!='cancelled'").get().v;
    feat30  = db.prepare("SELECT COALESCE(SUM(price_cents),0) AS v FROM featured_products WHERE paid_via='balance' AND status!='cancelled' AND created_at >= ?").get(d30).v;
  } catch {}
  try {
    badgeAll = db.prepare("SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments WHERE paid_via='balance'").get().v;
    badge30  = db.prepare("SELECT COALESCE(SUM(price_cents),0) AS v FROM verified_badge_payments WHERE paid_via='balance' AND created_at >= ?").get(d30).v;
  } catch {}

  const totalRev = revAll.pc + revAll.fx + advAll + featAll + badgeAll;
  const totalRev30 = rev30.pc + rev30.fx + adv30 + feat30 + badge30;

  // Saques pendentes (alertas)
  const pendingWithdrawals = db.prepare("SELECT COUNT(*) AS c FROM withdrawals WHERE status='pending'").get().c;
  const pendingVerifs = (() => { try { return db.prepare("SELECT COUNT(*) AS c FROM user_verifications WHERE status='pending_review'").get().c; } catch { return 0; } })();
  const openTickets = (() => { try { return db.prepare("SELECT COUNT(*) AS c FROM support_inquiries WHERE status='open'").get().c; } catch { return 0; } })();

  res.json({
    users: { total: userTotal, pro: userPro, new_30d: userNew30, active_7d: userActive7 },
    gmv: { total_cents: grossAll, last_30d_cents: gross30 },
    revenue: {
      total_cents: totalRev,
      last_30d_cents: totalRev30,
      sources_total: {
        percent_cents: revAll.pc,
        fixed_cents: revAll.fx,
        advance_cents: advAll,
        featured_cents: featAll,
        badge_cents: badgeAll
      },
      sources_30d: {
        percent_cents: rev30.pc,
        fixed_cents: rev30.fx,
        advance_cents: adv30,
        featured_cents: feat30,
        badge_cents: badge30
      }
    },
    alerts: {
      pending_withdrawals: pendingWithdrawals,
      pending_verifications: pendingVerifs,
      open_support_tickets: openTickets
    }
  });
});

// Top vendedores
router.get('/api/top-sellers', (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const rows = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.discord_tag, u.discord_avatar, u.plan, u.role,
           COUNT(s.id) AS sales,
           COALESCE(SUM(s.amount_cents), 0) AS gmv_cents,
           COALESCE(SUM(COALESCE(s.platform_fee_cents,0) + COALESCE(s.platform_fixed_fee_cents,0)),0) AS revenue_cents
    FROM users u
    LEFT JOIN user_guilds ug ON ug.user_id = u.id AND ug.role='owner'
    LEFT JOIN sales s ON s.guild_id = ug.guild_id AND s.status='paid'
    WHERE u.active=1
    GROUP BY u.id
    HAVING gmv_cents > 0
    ORDER BY gmv_cents DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

// Lista super-admins (equipe da plataforma)
router.get('/api/team', (req, res) => {
  const { emails, dids } = superAdminAllowlist();
  const dbAdmins = db.prepare(`
    SELECT id, email, display_name, discord_id, discord_tag, discord_avatar, last_login_at, created_at, is_super_admin, active
    FROM users WHERE is_super_admin=1 ORDER BY created_at ASC
  `).all();
  res.json({
    bootstrap_emails: emails,
    bootstrap_discord_ids: dids,
    members: dbAdmins
  });
});

// Promove/rebaixa membro da equipe (so super-admin pode mexer aqui)
router.post('/api/team/:userId', (req, res) => {
  const { is_super_admin } = req.body || {};
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.userId);
  if (!target) return res.status(404).json({ error: 'user nao encontrado' });
  // self-demote bloqueado
  if (req.appUser.id === target.id && is_super_admin === false) {
    return res.status(400).json({ error: 'voce nao pode se rebaixar' });
  }
  db.prepare('UPDATE users SET is_super_admin=? WHERE id=?').run(is_super_admin ? 1 : 0, target.id);
  audit.log({ req, action: 'admin_panel.team.toggle', target_id: target.id, details: { is_super_admin: !!is_super_admin } });
  res.json({ ok: true });
});

// Convida novo super-admin por email (cria conta + envia senha temp se SMTP ok)
router.post('/api/team/invite', async (req, res) => {
  const { email, display_name } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email invalido' });
  const lower = email.toLowerCase();
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(lower);
  const pw = Math.random().toString(36).slice(-12);
  const hash = await bcrypt.hash(pw, 10);
  if (u) {
    db.prepare('UPDATE users SET is_super_admin=1, active=1, password_hash=? WHERE id=?').run(hash, u.id);
  } else {
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, display_name, role, plan, is_super_admin, active)
      VALUES (?, ?, ?, 'owner', 'pro', 1, 1)
    `).run(lower, hash, display_name || lower.split('@')[0]);
    u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  }
  audit.log({ req, action: 'admin_panel.team.invite', target_id: u.id, details: { email: lower } });
  res.json({ ok: true, user_id: u.id, temp_password: pw, login_url: '/admin/login.html' });
});

// Configuracao do sistema (ler/escrever credenciais sensiveis)
router.get('/api/credentials/status', (req, res) => {
  const keys = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_TOKEN',
                'MISTICPAY_CLIENT_ID', 'MISTICPAY_CLIENT_SECRET', 'MISTICPAY_WEBHOOK_SECRET',
                'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const out = {};
  for (const k of keys) {
    const v = getCredential(k);
    out[k] = { set: !!v, length: v ? String(v).length : 0 };
  }
  res.json(out);
});

module.exports = router;
