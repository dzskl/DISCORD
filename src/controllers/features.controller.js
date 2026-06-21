// Stub controllers pra paginas novas — persistencia via guild_config.
// Cada chave eh JSON serializado.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

function getCfg(guildId, key, fallback = null) {
  if (!guildId) return fallback;
  const row = db.prepare('SELECT value FROM guild_config WHERE guild_id=? AND key=?').get(guildId, key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setCfg(guildId, key, value) {
  if (!guildId) throw new Error('guild_id obrigatorio');
  db.prepare(`
    INSERT INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value=excluded.value
  `).run(guildId, key, JSON.stringify(value));
}

// ============ BRANDING ============
router.get('/branding', (req, res) => {
  res.json(getCfg(req.guildId, 'branding', {
    bot_name: '', bot_avatar_url: '', color: '#5865f2', tagline: '',
    welcome: '', goodbye: '', sale_dm: ''
  }));
});
router.put('/branding', (req, res) => {
  setCfg(req.guildId, 'branding', req.body || {});
  res.json({ ok: true });
});

// ============ FEATURES (toggles dos modulos) ============
const FEATURE_DEFS = [
  { key: 'tickets',     label: 'Tickets',                desc: 'Sistema de atendimento via threads.', icon: '🎫' },
  { key: 'giveaways',   label: 'Sorteios',               desc: 'Sorteios automatizados com reações.', icon: '🎁' },
  { key: 'autoreply',   label: 'Auto-respostas',         desc: 'Respostas automaticas a mensagens.', icon: '💬' },
  { key: 'invites',     label: 'Tracking de Convites',   desc: 'Quem trouxe quem pro servidor.', icon: '📨' },
  { key: 'protection',  label: 'Anti-raid / AutoMod',    desc: 'Bloqueio de spam e raid.', icon: '🛡️' },
  { key: 'welcome',     label: 'Boas-Vindas',            desc: 'Mensagem automatica em novos members.', icon: '👋' },
  { key: 'vips',        label: 'VIPs',                   desc: 'Recompensas escaladas por compras.', icon: '⭐' },
  { key: 'ecloud',      label: 'eCloud',                 desc: 'Captura de membros via OAuth2.', icon: '☁️' },
  { key: 'affiliates',  label: 'Afiliados',              desc: 'Sistema de comissão por indicacao.', icon: '🤝' },
  { key: 'coupons',     label: 'Cupons',                 desc: 'Codigos de desconto na loja.', icon: '🎟️' },
  { key: 'daily_report',label: 'Relatorio Diario',       desc: 'DM com resumo do dia.', icon: '📊' },
  { key: 'restock_announce', label: 'Anuncio de Restock', desc: 'Avisa quando produto volta.', icon: '📦' }
];

router.get('/features', (req, res) => {
  const enabled = getCfg(req.guildId, 'features_enabled', {});
  res.json(FEATURE_DEFS.map(f => ({ ...f, enabled: enabled[f.key] !== false })));
});
router.put('/features/:key', (req, res) => {
  const map = getCfg(req.guildId, 'features_enabled', {}) || {};
  map[req.params.key] = !!req.body?.enabled;
  setCfg(req.guildId, 'features_enabled', map);
  res.json({ ok: true });
});

// ============ PROTECAO ============
const PROTECTION_RULES = [
  { key: 'antiraid',       label: 'Anti-raid',                desc: 'Bloqueia entrada em massa (>5 joins em 10s).' },
  { key: 'antispam',       label: 'Anti-spam',                desc: 'Mute em quem manda 5+ msgs em 4s.' },
  { key: 'antilink',       label: 'Anti-link',                desc: 'Apaga links nao autorizados.' },
  { key: 'antimention',    label: 'Anti-menção em massa',     desc: 'Bloqueia menções a mais de 5 usuarios.' },
  { key: 'anticaps',       label: 'Anti-CAPS',                desc: 'Apaga mensagens com >70% caps.' },
  { key: 'antiinvite',     label: 'Anti-invite externo',      desc: 'Apaga links de outros servidores.' }
];

router.get('/protection', (req, res) => {
  res.json({
    rules: PROTECTION_RULES.map(r => ({
      ...r, enabled: !!(getCfg(req.guildId, 'protection_rules', {}) || {})[r.key]
    })),
    banned_words: getCfg(req.guildId, 'protection_banned_words', [])
  });
});
router.put('/protection', (req, res) => {
  const { rules, banned_words } = req.body || {};
  if (rules) setCfg(req.guildId, 'protection_rules', rules);
  if (Array.isArray(banned_words)) setCfg(req.guildId, 'protection_banned_words', banned_words);
  res.json({ ok: true });
});

// ============ ECLOUD ============
router.get('/ecloud', (req, res) => {
  const cfg = getCfg(req.guildId, 'ecloud', { target_guild: '' });
  const publicUrl = process.env.PUBLIC_URL || '';
  res.json({
    redirect_uri: publicUrl + '/auth/discord/callback',
    target_guild: cfg.target_guild || '',
    members: [] // placeholder — captura real precisa de tabela propria
  });
});
router.put('/ecloud', (req, res) => {
  setCfg(req.guildId, 'ecloud', { target_guild: req.body?.target_guild || '' });
  res.json({ ok: true });
});

// ============ VIPs ============
router.get('/vips', (req, res) => {
  const tiers = getCfg(req.guildId, 'vip_tiers', [
    { name: 'Bronze', min_spend: 100, perks: 'Cargo Bronze, prioridade no atendimento' },
    { name: 'Prata',  min_spend: 500, perks: 'Cargo Prata + 5% off em compras' },
    { name: 'Ouro',   min_spend: 1500, perks: 'Cargo Ouro + 10% off + acesso vip-chat' }
  ]);
  res.json({ tiers, members: [] });
});
router.put('/vips', (req, res) => {
  setCfg(req.guildId, 'vip_tiers', req.body?.tiers || []);
  res.json({ ok: true });
});

// ============ BOAS-VINDAS (lista de mensagens custom por canal) ============
router.get('/welcome-messages', (req, res) => {
  res.json(getCfg(req.guildId, 'welcome_messages', { boas_vindas: [], despedida: [] }));
});
router.put('/welcome-messages', (req, res) => {
  setCfg(req.guildId, 'welcome_messages', req.body || { boas_vindas: [], despedida: [] });
  res.json({ ok: true });
});

// ============ PREFIXO DO BOT ============
router.get('/prefix', (req, res) => {
  res.json({ prefix: getCfg(req.guildId, 'bot_prefix', '!') });
});
router.put('/prefix', (req, res) => {
  const p = (req.body?.prefix || '!').toString().slice(0, 5);
  setCfg(req.guildId, 'bot_prefix', p);
  res.json({ ok: true });
});

module.exports = router;
