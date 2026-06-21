// Configurar Bot: token update, resgatar codigo promocional, transferir posse.
const express = require('express');
const { db, getCredential, setCredential } = require('../database/connection');
const { requireAuth, requireOwner } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

// ============ TOKEN DO BOT ============
router.put('/token', (req, res) => {
  const { token } = req.body || {};
  if (!token || token.length < 50) return res.status(400).json({ error: 'token invalido' });
  setCredential('DISCORD_TOKEN', token);
  audit.log({ req, action: 'bot.token_update' });
  // Reinicia o bot async
  try { require('../services/bot.service').restart?.().catch(() => {}); } catch {}
  res.json({ ok: true });
});

router.get('/token-status', (req, res) => {
  const t = getCredential('DISCORD_TOKEN');
  res.json({ configured: !!t, masked: t ? t.slice(0, 4) + '...' + t.slice(-4) : null });
});

// ============ RESGATAR CODIGO PROMOCIONAL ============
router.post('/redeem', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'codigo obrigatorio' });

  const c = String(code).trim().toUpperCase();
  const promo = db.prepare('SELECT * FROM promo_codes WHERE code=?').get(c);
  if (!promo) return res.status(404).json({ error: 'codigo invalido' });
  if (promo.expires_at && promo.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(410).json({ error: 'codigo expirado' });
  }
  if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
    return res.status(410).json({ error: 'codigo esgotado' });
  }

  const already = db.prepare('SELECT 1 FROM promo_redemptions WHERE code_id=? AND user_id=?').get(promo.id, req.appUser.id);
  if (already) return res.status(400).json({ error: 'voce ja resgatou este codigo' });

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO promo_redemptions (code_id, user_id) VALUES (?, ?)').run(promo.id, req.appUser.id);
    db.prepare('UPDATE promo_codes SET used_count=used_count+1 WHERE id=?').run(promo.id);

    if (promo.kind === 'trial_extend') {
      const days = parseInt(String(promo.value).replace(/\D/g, '')) || 7;
      const user = db.prepare('SELECT trial_ends_at, subscription_ends_at FROM users WHERE id=?').get(req.appUser.id);
      const base = Math.max(user?.trial_ends_at || 0, user?.subscription_ends_at || 0, Math.floor(Date.now() / 1000));
      const newEnd = base + days * 86400;
      db.prepare(`UPDATE users SET plan='pro', subscription_status='trialing', trial_ends_at=?, subscription_ends_at=? WHERE id=?`)
        .run(newEnd, newEnd, req.appUser.id);
    } else if (promo.kind === 'credit') {
      // adiciona credito como saldo "extra" via withdraw negativa? simplificacao:
      // marca como nota — implementacao real adicionaria a uma tabela credits
      db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'info', ?, ?)`)
        .run(req.appUser.id, 'Crédito resgatado', `R$ ${(parseInt(promo.value) / 100).toFixed(2)} de crédito adicionado.`);
    } else if (promo.kind === 'module_unlock') {
      db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'info', ?, ?)`)
        .run(req.appUser.id, 'Módulo desbloqueado', `Módulo "${promo.value}" liberado.`);
    }
  });
  tx();
  audit.log({ req, action: 'promo.redeem', target_id: promo.id, details: { code: c, kind: promo.kind } });
  res.json({ ok: true, kind: promo.kind, value: promo.value, description: promo.description });
});

// ============ TRANSFERENCIA DE POSSE ============
router.post('/transfer', (req, res) => {
  const { bot_instance_id, target_discord_id, confirm } = req.body || {};
  if (confirm !== 'IRREVERSIVEL') return res.status(400).json({ error: 'confirmacao obrigatoria (envie confirm="IRREVERSIVEL")' });
  if (!bot_instance_id || !target_discord_id) return res.status(400).json({ error: 'bot_instance_id e target_discord_id obrigatorios' });

  const inst = db.prepare('SELECT * FROM bot_instances WHERE id=?').get(bot_instance_id);
  if (!inst) return res.status(404).json({ error: 'bot nao encontrado' });
  if (inst.owner_user_id !== req.appUser.id) return res.status(403).json({ error: 'apenas o dono pode transferir' });

  const target = db.prepare(`SELECT id FROM users WHERE discord_id=? AND active=1`).get(String(target_discord_id));
  if (!target) return res.status(404).json({ error: 'novo dono nao tem conta na plataforma (precisa logar pelo Discord primeiro)' });

  db.prepare('UPDATE bot_instances SET owner_user_id=? WHERE id=?').run(target.id, inst.id);
  audit.log({ req, action: 'bot.transfer', target_id: inst.id, details: { from: req.appUser.id, to: target.id } });

  db.prepare(`INSERT INTO notifications (user_id, kind, title, body) VALUES (?, 'info', ?, ?)`)
    .run(target.id, 'Bot transferido pra você', `Você recebeu a posse de "${inst.name || inst.id}".`);

  res.json({ ok: true });
});

// ============ ADMIN: Gerar codigos (owner only) ============
router.post('/admin/promo-codes', requireOwner, (req, res) => {
  const { kind, value, max_uses, expires_at, description, count = 1 } = req.body || {};
  if (!['trial_extend', 'credit', 'module_unlock'].includes(kind)) return res.status(400).json({ error: 'kind invalido' });
  if (!value) return res.status(400).json({ error: 'value obrigatorio' });

  const generated = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < Math.min(50, Math.max(1, parseInt(count) || 1)); i++) {
      const code = 'NEVER-' + randomSegment(4) + '-' + randomSegment(4) + '-' + randomSegment(4);
      db.prepare(`
        INSERT INTO promo_codes (code, kind, value, max_uses, expires_at, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(code, kind, String(value), max_uses ? parseInt(max_uses) : null, expires_at ? parseInt(expires_at) : null, description || null, req.appUser.id);
      generated.push(code);
    }
  });
  tx();
  audit.log({ req, action: 'promo.generate', details: { kind, count: generated.length } });
  res.json({ ok: true, codes: generated });
});

router.get('/admin/promo-codes', requireOwner, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM promo_redemptions WHERE code_id=p.id) AS redemptions
    FROM promo_codes p ORDER BY p.created_at DESC LIMIT 200
  `).all();
  res.json(rows);
});

function randomSegment(n) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

module.exports = router;
