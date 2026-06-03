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
  // Principal
  { key: 'view',              group: 'Principal', label: 'Ver',                       desc: 'Permite ver as informações da aplicação.' },
  { key: 'manage_app',        group: 'Principal', label: 'Gerenciar Aplicação',       desc: 'Permite iniciar, parar e reiniciar a aplicação.' },
  { key: 'manage_resources',  group: 'Principal', label: 'Gerenciar Recursos',        desc: 'Permite gerenciar os recursos da aplicação.' },
  { key: 'change_server',     group: 'Principal', label: 'Mudar Servidor',            desc: 'Permite mudar o servidor da aplicação.' },
  { key: 'manage_team',       group: 'Principal', label: 'Gerenciar Permissões',      desc: 'Permite adicionar e remover permissões da aplicação.' },
  { key: 'bot_appearance',    group: 'Principal', label: 'Aparência do Bot',          desc: 'Permite mudar a aparência do bot — nome, avatar, cores, etc.' },
  { key: 'manage_products',   group: 'Principal', label: 'Gerenciar Produtos',        desc: 'Permite gerenciar os produtos do servidor.' },
  { key: 'manage_shop',       group: 'Principal', label: 'Gerenciar Geral da Loja',   desc: 'Permite gerenciar as configurações gerais da loja.' },
  { key: 'manage_stock',      group: 'Principal', label: 'Gerenciar Estoque',         desc: 'Permite gerenciar o estoque de produtos do servidor.' },
  { key: 'manage_protection', group: 'Principal', label: 'Gerenciar Proteção',        desc: 'Permite mudar as configurações de proteção do servidor.' },
  { key: 'manage_ecloud',     group: 'Principal', label: 'Gerenciar eCloud',          desc: 'Permite gerenciar as configurações do OAuth2 e puxar os membros.' },
  { key: 'manage_giveaways',  group: 'Principal', label: 'Gerenciar Sorteios',        desc: 'Permite gerenciar os sorteios do servidor.' },
  { key: 'manage_tickets',    group: 'Principal', label: 'Gerenciar Tickets',         desc: 'Permite gerenciar tickets de atendimento.' },
  { key: 'manage_autoreply',  group: 'Principal', label: 'Gerenciar Auto-respostas',  desc: 'Permite criar e editar respostas automáticas.' },
  { key: 'manage_coupons',    group: 'Principal', label: 'Gerenciar Cupons',          desc: 'Permite criar e editar cupons de desconto.' },
  { key: 'manage_affiliates', group: 'Principal', label: 'Gerenciar Afiliados',       desc: 'Permite cadastrar e gerenciar afiliados.' },

  // Geral
  { key: 'view_finance',      group: 'Geral',     label: 'Ver Rendimentos',           desc: 'Permite ver as estatísticas de rendimentos do servidor.' },
  { key: 'view_sales',        group: 'Geral',     label: 'Ver Vendas',                desc: 'Permite ver vendas, clientes e relatórios.' },
  { key: 'view_audit',        group: 'Geral',     label: 'Ver Auditoria',             desc: 'Permite ver o log de auditoria das ações.' },
  { key: 'view_logs',         group: 'Geral',     label: 'Ver Logs',                  desc: 'Permite ver os logs do bot.' },
  { key: 'withdraw',          group: 'Geral',     label: 'Sacar',                     desc: 'Permite solicitar saques do saldo.' },

  // Moderação
  { key: 'mod_ban',           group: 'Moderação', label: 'Banir',                     desc: 'Permite banir membros do servidor.' },
  { key: 'mod_kick',          group: 'Moderação', label: 'Expulsar',                  desc: 'Permite expulsar membros do servidor.' },
  { key: 'mod_timeout',       group: 'Moderação', label: 'Castigar (Timeout)',        desc: 'Permite aplicar timeout em membros.' },
  { key: 'mod_warn',          group: 'Moderação', label: 'Avisar',                    desc: 'Permite registrar advertências.' }
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

// Busca de usuarios por nome/discord_id pra adicionar a guild
router.get('/users/search', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!canManageTeam(req)) return res.status(403).json({ error: 'sem permissao' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.discord_id, u.discord_tag, u.discord_avatar,
           (SELECT 1 FROM user_guilds ug WHERE ug.user_id=u.id AND ug.guild_id=?) AS already_member
    FROM users u
    WHERE u.active=1 AND (
      u.email LIKE ? OR u.display_name LIKE ? OR u.discord_tag LIKE ? OR u.discord_id = ? OR CAST(u.id AS TEXT) = ?
    )
    LIMIT 12
  `).all(req.guildId, like, like, like, q, q);
  res.json(rows);
});

// Adiciona membro a guild (por user_id, vindo do search)
router.post('/members', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!canManageTeam(req)) return res.status(403).json({ error: 'sem permissao' });
  const { user_id, email, role } = req.body || {};

  let user = null;
  if (user_id) user = db.prepare(`SELECT id FROM users WHERE id=? AND active=1`).get(user_id);
  else if (email) user = db.prepare(`SELECT id FROM users WHERE email=? AND active=1`).get(email.trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'usuario nao encontrado' });

  db.prepare(`
    INSERT INTO user_guilds (user_id, guild_id, role)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET role=excluded.role
  `).run(user.id, req.guildId, role === 'admin' ? 'admin' : 'member');
  // default: da permissao 'view'
  db.prepare(`
    INSERT INTO team_permissions (user_id, guild_id, permission, granted) VALUES (?,?, 'view', 1)
    ON CONFLICT(user_id, guild_id, permission) DO UPDATE SET granted=1
  `).run(user.id, req.guildId);
  audit.log({ req, action: 'team.add_member', target_id: user.id });
  res.json({ ok: true, user_id: user.id });
});

// Bulk save: substitui o conjunto de permissoes do usuario na guild
router.put('/permissions/:userId', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!canManageTeam(req)) return res.status(403).json({ error: 'sem permissao' });
  const target = db.prepare(`SELECT role FROM user_guilds WHERE user_id=? AND guild_id=?`).get(req.params.userId, req.guildId);
  if (!target) return res.status(404).json({ error: 'membro nao esta na guild' });
  if (target.role === 'owner') return res.status(400).json({ error: 'owner sempre tem todas as permissoes' });

  const { permissions } = req.body || {};
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions deve ser array' });
  const validKeys = new Set(ALL_PERMISSIONS.map(p => p.key));
  const wanted = permissions.filter(p => validKeys.has(p));

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM team_permissions WHERE user_id=? AND guild_id=?`).run(req.params.userId, req.guildId);
    const ins = db.prepare(`INSERT INTO team_permissions (user_id, guild_id, permission, granted) VALUES (?,?,?,1)`);
    for (const p of wanted) ins.run(req.params.userId, req.guildId, p);
  });
  tx();
  audit.log({ req, action: 'team.permissions_set', target_id: req.params.userId, details: { permissions: wanted } });
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
