// Permissoes granulares da equipe (por user dentro de uma guild).
// Permissoes disponiveis: view, manage_app, edit_shop, manage_team,
// withdraw, view_finance, mod.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

const ALL_PERMISSIONS = [
  { key: 'view', label: 'Ver', desc: 'Permite ver as informações da aplicação.' },
  { key: 'manage_app', label: 'Gerenciar Aplicação', desc: 'Permite iniciar, parar e reiniciar a aplicação.' },
  { key: 'edit_shop', label: 'Editar Loja', desc: 'Criar/editar produtos, cupons, categorias.' },
  { key: 'manage_team', label: 'Gerenciar Equipe', desc: 'Adicionar/remover membros e mudar permissoes.' },
  { key: 'withdraw', label: 'Sacar', desc: 'Solicitar saques do saldo.' },
  { key: 'view_finance', label: 'Ver Finanças', desc: 'Ver vendas, receita e relatorios financeiros.' },
  { key: 'mod', label: 'Moderar', desc: 'Aplicar bans/kicks/timeouts/warns.' }
];

router.get('/permissions/_meta', (req, res) => res.json(ALL_PERMISSIONS));

// Lista membros da guild ativa + suas permissoes
router.get('/members', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const members = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.discord_tag, u.discord_avatar, ug.role, ug.added_at
    FROM user_guilds ug JOIN users u ON u.id = ug.user_id
    WHERE ug.guild_id = ?
    ORDER BY ug.added_at ASC
  `).all(req.guildId);

  const perms = db.prepare(`SELECT user_id, permission FROM team_permissions WHERE guild_id=? AND granted=1`).all(req.guildId);
  const permMap = {};
  for (const p of perms) {
    if (!permMap[p.user_id]) permMap[p.user_id] = [];
    permMap[p.user_id].push(p.permission);
  }

  res.json(members.map(m => ({
    ...m,
    permissions: m.role === 'owner' ? ALL_PERMISSIONS.map(p => p.key) : (permMap[m.id] || ['view'])
  })));
});

// Toggle de permissao individual (owner ou quem tem manage_team)
router.post('/permissions/:userId/:permission', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!canManageTeam(req)) return res.status(403).json({ error: 'sem permissao manage_team' });

  const { granted } = req.body || {};
  const perm = req.params.permission;
  if (!ALL_PERMISSIONS.find(p => p.key === perm)) return res.status(400).json({ error: 'permissao invalida' });

  // Owner nao pode ter permissoes alteradas
  const target = db.prepare(`SELECT role FROM user_guilds WHERE user_id=? AND guild_id=?`).get(req.params.userId, req.guildId);
  if (!target) return res.status(404).json({ error: 'membro nao esta na guild' });
  if (target.role === 'owner') return res.status(400).json({ error: 'owner sempre tem todas as permissoes' });

  if (granted) {
    db.prepare(`
      INSERT INTO team_permissions (user_id, guild_id, permission, granted)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, guild_id, permission) DO UPDATE SET granted=1, granted_at=strftime('%s','now')
    `).run(req.params.userId, req.guildId, perm);
  } else {
    db.prepare(`DELETE FROM team_permissions WHERE user_id=? AND guild_id=? AND permission=?`)
      .run(req.params.userId, req.guildId, perm);
  }
  audit.log({ req, action: 'team.permission', target_id: req.params.userId, details: { permission: perm, granted: !!granted } });
  res.json({ ok: true });
});

// Adiciona membro a guild
router.post('/members', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!canManageTeam(req)) return res.status(403).json({ error: 'sem permissao' });
  const { email, role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email obrigatorio' });

  const user = db.prepare(`SELECT id FROM users WHERE email=? AND active=1`).get(email.trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'usuario nao encontrado (deve ter conta na plataforma)' });

  db.prepare(`
    INSERT INTO user_guilds (user_id, guild_id, role)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET role=excluded.role
  `).run(user.id, req.guildId, role === 'admin' ? 'admin' : 'member');
  audit.log({ req, action: 'team.add_member', target_id: user.id });
  res.json({ ok: true });
});

router.delete('/members/:userId', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!canManageTeam(req)) return res.status(403).json({ error: 'sem permissao' });
  const target = db.prepare(`SELECT role FROM user_guilds WHERE user_id=? AND guild_id=?`).get(req.params.userId, req.guildId);
  if (target?.role === 'owner') return res.status(400).json({ error: 'nao pode remover owner' });
  db.prepare(`DELETE FROM user_guilds WHERE user_id=? AND guild_id=?`).run(req.params.userId, req.guildId);
  db.prepare(`DELETE FROM team_permissions WHERE user_id=? AND guild_id=?`).run(req.params.userId, req.guildId);
  audit.log({ req, action: 'team.remove_member', target_id: req.params.userId });
  res.json({ ok: true });
});

function canManageTeam(req) {
  if (req.appUser?.role === 'owner') return true;
  const myRole = db.prepare(`SELECT role FROM user_guilds WHERE user_id=? AND guild_id=?`).get(req.appUser.id, req.guildId);
  if (myRole?.role === 'owner') return true;
  const has = db.prepare(`SELECT 1 FROM team_permissions WHERE user_id=? AND guild_id=? AND permission='manage_team' AND granted=1`)
    .get(req.appUser.id, req.guildId);
  return !!has;
}

module.exports = router;
