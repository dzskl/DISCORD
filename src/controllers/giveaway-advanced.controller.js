// Endpoints avancados de sorteios (Requisitos + Tarefas)
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM giveaways WHERE id=?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'sorteio nao encontrado' });
  const tasks = db.prepare('SELECT * FROM giveaway_tasks WHERE giveaway_id=? ORDER BY order_idx, id').all(g.id);
  res.json({
    ...g,
    requirements: safeJson(g.requirements_json, {}),
    tasks
  });
});

router.put('/:id/general', (req, res) => {
  const { name, icon_url, banner_url, description, delivery_type, delivery_payload, monitor } = req.body || {};
  db.prepare(`
    UPDATE giveaways SET
      prize = COALESCE(?, prize),
      icon_url = COALESCE(?, icon_url),
      banner_url = COALESCE(?, banner_url),
      description = COALESCE(?, description),
      delivery_type = COALESCE(?, delivery_type),
      delivery_payload = COALESCE(?, delivery_payload),
      monitor = COALESCE(?, monitor)
    WHERE id = ?
  `).run(
    name ?? null,
    icon_url ?? null,
    banner_url ?? null,
    description ?? null,
    delivery_type ?? null,
    delivery_payload ?? null,
    monitor != null ? (monitor ? 1 : 0) : null,
    req.params.id
  );
  res.json({ ok: true });
});

router.put('/:id/requirements', (req, res) => {
  const reqs = req.body || {};
  db.prepare('UPDATE giveaways SET requirements_json=? WHERE id=?').run(JSON.stringify(reqs), req.params.id);
  res.json({ ok: true });
});

// Tasks CRUD
router.get('/:id/tasks', (req, res) => {
  res.json(db.prepare('SELECT * FROM giveaway_tasks WHERE giveaway_id=? ORDER BY order_idx, id').all(req.params.id));
});

router.post('/:id/tasks', (req, res) => {
  const { type, title, url, payload, auto_verify, order_idx } = req.body || {};
  if (!type || !title) return res.status(400).json({ error: 'type e title obrigatorios' });
  const valid = ['twitter_follow', 'discord_join', 'youtube_sub', 'url_visit', 'custom'];
  if (!valid.includes(type)) return res.status(400).json({ error: 'type invalido' });
  const info = db.prepare(`
    INSERT INTO giveaway_tasks (giveaway_id, type, title, url, payload, auto_verify, order_idx)
    VALUES (?,?,?,?,?,?,?)
  `).run(req.params.id, type, String(title).slice(0, 200), url || null, payload || null, auto_verify ? 1 : 0, parseInt(order_idx) || 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id/tasks/:taskId', (req, res) => {
  const { title, url, payload, auto_verify, order_idx } = req.body || {};
  db.prepare(`
    UPDATE giveaway_tasks SET
      title = COALESCE(?, title),
      url = COALESCE(?, url),
      payload = COALESCE(?, payload),
      auto_verify = COALESCE(?, auto_verify),
      order_idx = COALESCE(?, order_idx)
    WHERE id = ? AND giveaway_id = ?
  `).run(
    title ?? null, url ?? null, payload ?? null,
    auto_verify != null ? (auto_verify ? 1 : 0) : null,
    order_idx != null ? parseInt(order_idx) : null,
    req.params.taskId, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id/tasks/:taskId', (req, res) => {
  db.prepare('DELETE FROM giveaway_tasks WHERE id=? AND giveaway_id=?').run(req.params.taskId, req.params.id);
  res.json({ ok: true });
});

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
