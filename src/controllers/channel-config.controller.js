// Config de canais agrupados por contexto. Tudo armazenado em guild_config
// como JSON no key 'channel_config'.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

const CHANNEL_GROUPS = [
  { id: 'sistema', label: 'Sistema', desc: 'Canais para logs do sistema e operações', keys: [
    { key: 'sistema', label: 'Sistema' },
    { key: 'comandos', label: 'Comandos' }
  ]},
  { id: 'loja', label: 'Loja', desc: 'Canais relacionados a transações e compras', keys: [
    { key: 'compras', label: 'Compras' },
    { key: 'eventos_compras', label: 'Eventos de Compras' },
    { key: 'feedback', label: 'Feedback' }
  ]},
  { id: 'membros', label: 'Membros', desc: 'Canais para logs de atividades dos membros', keys: [
    { key: 'entrada', label: 'Entrada' },
    { key: 'saida', label: 'Saída' },
    { key: 'mensagens', label: 'Mensagens' },
    { key: 'trafego', label: 'Tráfego' }
  ]},
  { id: 'convites', label: 'Convites', desc: 'Canais para o sistema de convites e boas-vindas', keys: [
    { key: 'log_convites', label: 'Log de Convites' },
    { key: 'boas_vindas', label: 'Boas-vindas / Despedida' }
  ]},
  { id: 'moderacao', label: 'Moderação', desc: 'Canais para logs de ações de moderação', keys: [
    { key: 'bans', label: 'Bans' },
    { key: 'kicks', label: 'Kicks' },
    { key: 'timeouts', label: 'Timeouts' }
  ]},
  { id: 'cargos', label: 'Cargos', desc: 'Canais para logs de gerenciamento de cargos', keys: [
    { key: 'cargos_adicionados', label: 'Cargos Adicionados' },
    { key: 'cargos_removidos', label: 'Cargos Removidos' },
    { key: 'cargos_criados', label: 'Cargos Criados' }
  ]}
];

router.get('/_meta', (req, res) => res.json(CHANNEL_GROUPS));

router.get('/', (req, res) => {
  if (!req.guildId) return res.json({});
  const row = db.prepare('SELECT value FROM guild_config WHERE guild_id=? AND key=?').get(req.guildId, 'channel_config');
  let cfg = {};
  if (row) { try { cfg = JSON.parse(row.value); } catch {} }
  res.json(cfg);
});

router.put('/', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const body = req.body || {};
  // valida keys
  const validKeys = new Set();
  for (const g of CHANNEL_GROUPS) for (const k of g.keys) validKeys.add(k.key);
  const clean = {};
  for (const [k, v] of Object.entries(body)) if (validKeys.has(k)) clean[k] = v ? String(v) : null;
  db.prepare(`
    INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value=excluded.value
  `).run(req.guildId, 'channel_config', JSON.stringify(clean));
  res.json({ ok: true });
});

module.exports = router;
