// Config de cargos agrupados (Administracao, Membros).
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

const ROLE_GROUPS = [
  { id: 'administracao', label: 'Administração', desc: 'Cargos para administradores e moderadores', keys: [
    { key: 'admin', label: 'Administrador' },
    { key: 'staff_vendas', label: 'Suporte (Staff Vendas)' },
    { key: 'staff_ticket', label: 'Staff Ticket' }
  ]},
  { id: 'membros', label: 'Membros', desc: 'Cargos para diferentes tipos de membros', keys: [
    { key: 'verificado', label: 'Verificado (eCloud)' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'auto_role', label: 'Membro (Auto-Role)' }
  ]}
];

router.get('/_meta', (req, res) => res.json(ROLE_GROUPS));

router.get('/', (req, res) => {
  if (!req.guildId) return res.json({});
  const row = db.prepare('SELECT value FROM guild_config WHERE guild_id=? AND key=?').get(req.guildId, 'role_config');
  let cfg = {};
  if (row) { try { cfg = JSON.parse(row.value); } catch {} }
  res.json(cfg);
});

router.put('/', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const body = req.body || {};
  const validKeys = new Set();
  for (const g of ROLE_GROUPS) for (const k of g.keys) validKeys.add(k.key);
  const clean = {};
  for (const [k, v] of Object.entries(body)) if (validKeys.has(k)) clean[k] = v ? String(v) : null;
  db.prepare(`
    INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value=excluded.value
  `).run(req.guildId, 'role_config', JSON.stringify(clean));
  res.json({ ok: true });
});

module.exports = router;
