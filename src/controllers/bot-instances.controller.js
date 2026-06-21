// Multi-bot por conta — CRUD de bot_instances + switcher.
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

function ensureDefaultBot(userId) {
  try {
    // Confirma que o user existe na tabela users (evita FK fail em DEV bypass)
    const userRow = db.prepare('SELECT id, display_name, email FROM users WHERE id=?').get(userId);
    if (!userRow) return;
    const c = db.prepare('SELECT COUNT(*) AS c FROM bot_instances WHERE owner_user_id=?').get(userId).c;
    if (c > 0) return;
    const ug = db.prepare(`SELECT g.id, g.name FROM user_guilds ug JOIN guilds g ON g.id=ug.guild_id WHERE ug.user_id=? LIMIT 1`).get(userId);
    const name = (userRow.display_name || userRow.email || 'Meu Bot').toString().slice(0, 60);
    db.prepare(`
      INSERT INTO bot_instances (owner_user_id, name, primary_guild_id, plan, trial_ends_at)
      VALUES (?, ?, ?, 'pro', ?)
    `).run(userId, name + ' Bot', ug?.id || null, Math.floor(Date.now() / 1000) + 7 * 86400);
  } catch (e) {
    require('../utils/logger').warn({ err: e.message, userId }, 'ensureDefaultBot falhou');
  }
}

router.get('/', (req, res) => {
  ensureDefaultBot(req.appUser.id);
  const rows = db.prepare(`
    SELECT b.*, g.name AS guild_name
    FROM bot_instances b
    LEFT JOIN guilds g ON g.id = b.primary_guild_id
    WHERE b.owner_user_id = ?
    ORDER BY b.created_at ASC
  `).all(req.appUser.id);
  const activeId = req.session?.active_bot_id || rows[0]?.id || null;
  if (req.session && !req.session.active_bot_id && rows[0]) req.session.active_bot_id = rows[0].id;
  res.json({ instances: rows, active_id: activeId });
});

router.post('/', (req, res) => {
  const { name, primary_guild_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'nome obrigatorio' });
  const info = db.prepare(`
    INSERT INTO bot_instances (owner_user_id, name, primary_guild_id, plan, trial_ends_at)
    VALUES (?, ?, ?, 'pro', ?)
  `).run(req.appUser.id, name.trim().slice(0, 80), primary_guild_id || null, Math.floor(Date.now() / 1000) + 7 * 86400);
  audit.log({ req, action: 'bot_instance.create', target_id: info.lastInsertRowid });
  if (req.session) req.session.active_bot_id = info.lastInsertRowid;
  res.json(db.prepare('SELECT * FROM bot_instances WHERE id=?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const inst = db.prepare('SELECT * FROM bot_instances WHERE id=?').get(req.params.id);
  if (!inst || inst.owner_user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrado' });
  const { name, nickname, avatar_url, discord_client_id, primary_guild_id } = req.body || {};
  db.prepare(`
    UPDATE bot_instances SET
      name = COALESCE(?, name),
      nickname = COALESCE(?, nickname),
      avatar_url = COALESCE(?, avatar_url),
      discord_client_id = COALESCE(?, discord_client_id),
      primary_guild_id = COALESCE(?, primary_guild_id)
    WHERE id = ?
  `).run(name ?? null, nickname ?? null, avatar_url ?? null, discord_client_id ?? null, primary_guild_id ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM bot_instances WHERE id=?').get(req.params.id));
});

router.post('/:id/activate', (req, res) => {
  const inst = db.prepare('SELECT * FROM bot_instances WHERE id=?').get(req.params.id);
  if (!inst || inst.owner_user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrado' });
  if (req.session) req.session.active_bot_id = inst.id;
  if (inst.primary_guild_id && req.session) req.session.active_guild_id = inst.primary_guild_id;
  res.json({ ok: true, active_id: inst.id });
});

router.delete('/:id', (req, res) => {
  const inst = db.prepare('SELECT * FROM bot_instances WHERE id=?').get(req.params.id);
  if (!inst || inst.owner_user_id !== req.appUser.id) return res.status(404).json({ error: 'nao encontrado' });
  // protege contra deletar a unica
  const c = db.prepare('SELECT COUNT(*) AS c FROM bot_instances WHERE owner_user_id=?').get(req.appUser.id).c;
  if (c <= 1) return res.status(400).json({ error: 'voce precisa ter ao menos um bot' });
  db.prepare('DELETE FROM bot_instances WHERE id=?').run(req.params.id);
  audit.log({ req, action: 'bot_instance.delete', target_id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
