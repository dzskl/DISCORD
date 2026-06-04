// Configuracao da Protecao anti-raid completa.
// 7 tabs com structures diferentes — tudo persistido em guild_config.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

const STRUCTURE = {
  anti_fake: {
    label: 'Anti Fake',
    desc: 'Configure defesas contra contas falsas e maliciosas',
    rules: [
      { key: 'enabled', label: 'Anti Fake', desc: 'Detecta contas recém-criadas e bots maliciosos' }
    ]
  },
  anti_spam: {
    label: 'Anti Spam',
    desc: 'Configure defesas do chat contra flood, spam e links maliciosos',
    rules: [
      { key: 'enabled', label: 'Anti Spam', desc: 'Detecta flood e spam de mensagens' }
    ]
  },
  canais: {
    label: 'Canais',
    desc: 'Previna ataques de destruição de canais do servidor',
    rules: [
      { key: 'defesa_delecao_canais',  label: 'Defesa contra Deleção de Canais', desc: 'Monitora e bloqueia exclusão excessiva de canais' },
      { key: 'defesa_edicao_canais',   label: 'Defesa contra Edição de Canais',  desc: 'Monitora e bloqueia alterações excessivas em canais' },
      { key: 'defesa_criacao_canais',  label: 'Defesa contra Criação de Canais', desc: 'Monitora e bloqueia criação excessiva de canais' }
    ]
  },
  cargos: {
    label: 'Cargos',
    desc: 'Previna ataques de destruição de cargos do servidor',
    rules: [
      { key: 'defesa_delecao_cargos',  label: 'Defesa contra Deleção de Cargos', desc: 'Monitora e bloqueia exclusão excessiva de cargos' },
      { key: 'defesa_edicao_cargos',   label: 'Defesa contra Edição de Cargos',  desc: 'Monitora e bloqueia alterações excessivas em cargos' },
      { key: 'defesa_criacao_cargos',  label: 'Defesa contra Criação de Cargos', desc: 'Monitora e bloqueia criação excessiva de cargos' }
    ]
  },
  moderacao: {
    label: 'Moderação',
    desc: 'Proteções contra abusos de ferramentas de moderação',
    rules: [
      { key: 'monitoramento_banimentos', label: 'Monitoramento de Banimentos Massivos', desc: 'Detecta e impede banimentos em massa por um moderador' },
      { key: 'monitoramento_expulsoes',  label: 'Monitoramento de Expulsões Massivas',  desc: 'Detecta e impede expulsões em massa por um moderador' }
    ]
  },
  seguranca_avancada: {
    label: 'Segurança Avançada',
    desc: 'Controle refinado sobre ações críticas e administrativas',
    rules: [
      { key: 'protecao_admin',          label: 'Proteção de Permissões Administrativas', desc: 'Impede alterações suspeitas em permissões críticas do servidor' },
      { key: 'controle_mencoes',        label: 'Controle de Menções Abusivas',           desc: 'Monitora e filtra o uso excessivo de menções (@everyone, @here)' },
      { key: 'gestao_punicoes',         label: 'Gestão de Punições do Sistema',          desc: 'Auditagem e controle sobre aplicações de punições automáticas' },
      { key: 'monitor_integracoes',     label: 'Monitoramento de Integrações (Bots)',    desc: 'Previne a adição de integrações ou bots maliciosos' },
      { key: 'controle_cargos_privados', label: 'Controle de Adição de Cargos Privados', desc: 'Proteção específica para cargos administrativos e restritos' }
    ]
  },
  permissoes_comandos: {
    label: 'Permissões de Comandos',
    desc: 'Defina quem pode usar cada comando de moderação',
    rules: [
      { key: 'ban',     label: '/ban',     desc: 'Banir usuários' },
      { key: 'unban',   label: '/unban',   desc: 'Desbanir usuários' },
      { key: 'kick',    label: '/kick',    desc: 'Expulsar usuários' },
      { key: 'mute',    label: '/mute',    desc: 'Silenciar usuários' },
      { key: 'unmute',  label: '/unmute',  desc: 'Desmutar usuários' },
      { key: 'lock',    label: '/lock',    desc: 'Trancar/destrancar canais' },
      { key: 'clear',   label: '/clear',   desc: 'Limpar mensagens do canal' },
      { key: 'cleardm', label: '/cleardm', desc: 'Limpar DMs do bot' },
      { key: 'nuke',    label: '/nuke',    desc: 'Recriar canais' },
      { key: 'say',     label: '/say',     desc: 'Enviar mensagens como bot' },
      { key: 'dm',      label: '/dm',      desc: 'Enviar DM para usuários' }
    ]
  }
};

function getCfg(guildId) {
  if (!guildId) return {};
  const row = db.prepare('SELECT value FROM guild_config WHERE guild_id=? AND key=?').get(guildId, 'protection_v2');
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

function setCfg(guildId, value) {
  if (!guildId) return;
  db.prepare(`
    INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value=excluded.value
  `).run(guildId, 'protection_v2', JSON.stringify(value));
}

// Esquema dos campos esperados em cada tipo de regra (pro frontend renderizar).
// 'monitoring': Limite + Intervalo + Punicao + Imunes + Logs
// 'defense'   : Punicao + Imunes + Logs
// 'globals'   : Punicao + Imunes + Logs (fallback do tab)
const RULE_SCHEMAS = {
  monitoring: ['limite', 'intervalo', 'punicao', 'cargos_imunes', 'canal_logs'],
  defense:    ['limite', 'intervalo', 'punicao', 'cargos_imunes', 'canal_logs'],
  globals:    ['punicao', 'cargos_imunes', 'canal_logs']
};

const PUNICOES = [
  { value: 'banir',         label: 'Banir' },
  { value: 'expulsar',      label: 'Expulsar' },
  { value: 'silenciar',     label: 'Silenciar (timeout)' },
  { value: 'tirar_cargos',  label: 'Tirar Cargos' },
  { value: 'remover_perms', label: 'Remover Permissões' },
  { value: 'avisar',        label: 'Apenas Avisar' }
];

// Marca tipo de cada regra
const RULE_TYPES = {
  defesa_delecao_canais: 'defense',  defesa_edicao_canais: 'defense',  defesa_criacao_canais: 'defense',
  defesa_delecao_cargos: 'defense',  defesa_edicao_cargos: 'defense',  defesa_criacao_cargos: 'defense',
  monitoramento_banimentos: 'monitoring', monitoramento_expulsoes: 'monitoring',
  protecao_admin: 'defense', controle_mencoes: 'monitoring', gestao_punicoes: 'defense',
  monitor_integracoes: 'defense', controle_cargos_privados: 'defense'
};

router.get('/_meta', (req, res) => res.json({
  structure: STRUCTURE,
  schemas: RULE_SCHEMAS,
  punicoes: PUNICOES,
  rule_types: RULE_TYPES
}));

// =================== Config expandida Anti Fake ===================
// { enabled, dias_minimos_conta, status_blacklist:[], nomes_blacklist:[] }
router.get('/anti-fake/config', (req, res) => {
  const cfg = getCfg(req.guildId);
  res.json(cfg.anti_fake_config || { enabled: false, dias_minimos_conta: 0, status_blacklist: [], nomes_blacklist: [] });
});
router.put('/anti-fake/config', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const cfg = getCfg(req.guildId);
  cfg.anti_fake_config = {
    enabled: !!req.body?.enabled,
    dias_minimos_conta: parseInt(req.body?.dias_minimos_conta) || 0,
    status_blacklist: Array.isArray(req.body?.status_blacklist) ? req.body.status_blacklist : [],
    nomes_blacklist: Array.isArray(req.body?.nomes_blacklist) ? req.body.nomes_blacklist : []
  };
  setCfg(req.guildId, cfg);
  res.json({ ok: true });
});

// =================== Config expandida Anti Spam (mega-painel) ===================
const ANTI_SPAM_DEFAULTS = {
  enabled: false,
  geral: { aplicar_comandos: false, ignorar_admin: true, canal_logs: null, canais_ignorados: [], cargos_ignorados: [], usuarios_ignorados: [] },
  acao_padrao: { apagar_mensagem: true, avisar_usuario: true, timeout_segundos: 30 },
  tolerancia_enabled: false,
  flood: { enabled: false, max_mensagens: 6, janela: 6, aplicar_canais: [], ignorar_canais: [], aplicar_cargos: [], ignorar_cargos: [], aplicar_usuarios: [], ignorar_usuarios: [] },
  spam: { enabled: false, mensagens_similares: 4, janela_analise: 20, tamanho_minimo: 6, aplicar_canais: [], ignorar_canais: [], aplicar_cargos: [], ignorar_cargos: [], aplicar_usuarios: [], ignorar_usuarios: [] },
  garbage: { enabled: false, proporcao_max: 0.7, max_repeticao: 12 },
  link: { enabled: false, bloquear_todos: false, permitir_discord_invites: true, dominios_permitidos: [], dominios_bloqueados: [], aplicar_canais: [], ignorar_canais: [], aplicar_cargos: [], ignorar_cargos: [], aplicar_usuarios: [], ignorar_usuarios: [] },
  raid: { enabled: false, janela_tempo: 60, min_usuarios: 5, min_mensagens: 10, min_caracteres: 3, aplicar_canais: [], ignorar_canais: [], aplicar_cargos: [], ignorar_cargos: [], aplicar_usuarios: [], ignorar_usuarios: [] }
};

router.get('/anti-spam/config', (req, res) => {
  const cfg = getCfg(req.guildId);
  res.json({ ...ANTI_SPAM_DEFAULTS, ...(cfg.anti_spam_config || {}) });
});
router.put('/anti-spam/config', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const cfg = getCfg(req.guildId);
  cfg.anti_spam_config = { ...ANTI_SPAM_DEFAULTS, ...(cfg.anti_spam_config || {}), ...req.body };
  setCfg(req.guildId, cfg);
  res.json({ ok: true });
});

// PUT regra individual: body { rule_key, enabled?, limite?, intervalo?, punicao?, cargos_imunes?, canal_logs? }
router.put('/:tab/rule/:ruleKey', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!STRUCTURE[req.params.tab]) return res.status(400).json({ error: 'tab invalida' });
  const cfg = getCfg(req.guildId);
  if (!cfg[req.params.tab]) cfg[req.params.tab] = {};
  if (!cfg[req.params.tab].rules) cfg[req.params.tab].rules = {};
  cfg[req.params.tab].rules[req.params.ruleKey] = { ...(cfg[req.params.tab].rules[req.params.ruleKey] || {}), ...req.body };
  setCfg(req.guildId, cfg);
  res.json({ ok: true });
});

// PUT configurações globais do tab: body { punicao?, cargos_imunes?, canal_logs? }
router.put('/:tab/globals', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!STRUCTURE[req.params.tab]) return res.status(400).json({ error: 'tab invalida' });
  const cfg = getCfg(req.guildId);
  if (!cfg[req.params.tab]) cfg[req.params.tab] = {};
  cfg[req.params.tab].globals = { ...(cfg[req.params.tab].globals || {}), ...req.body };
  setCfg(req.guildId, cfg);
  res.json({ ok: true });
});

router.get('/', (req, res) => res.json(getCfg(req.guildId)));

router.put('/:tab', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  if (!STRUCTURE[req.params.tab]) return res.status(400).json({ error: 'tab invalida' });
  const cfg = getCfg(req.guildId);
  cfg[req.params.tab] = req.body || {};
  setCfg(req.guildId, cfg);
  res.json({ ok: true });
});

module.exports = router;
