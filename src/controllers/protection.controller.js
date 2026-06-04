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

router.get('/_meta', (req, res) => res.json(STRUCTURE));

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
