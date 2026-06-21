// Sistema de Suporte do site — tickets web abertos por usuarios.
// Publico: abrir ticket + listar/responder os proprios.
// Admin (owner): inbox de todos os tickets + responder + fechar.

const express = require('express');
const { db } = require('../database/connection');
const { requireAuth, requireOwner } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();

const CATEGORIES = ['duvida', 'bug', 'cobranca', 'feature', 'outro'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'waiting_user', 'closed'];

// =========== PUBLICO ===========

// Cria ticket (publico, mas captura user_id se autenticado)
router.post('/', (req, res) => {
  const { name, email, subject, category, priority, message } = req.body || {};

  if (!email || !subject || !message) {
    return res.status(400).json({ error: 'email, subject e message obrigatorios' });
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(String(email))) {
    return res.status(400).json({ error: 'email invalido' });
  }
  if (String(subject).length > 200) return res.status(400).json({ error: 'subject muito longo' });
  if (String(message).length > 5000) return res.status(400).json({ error: 'message muito longa' });

  const cat = CATEGORIES.includes(category) ? category : 'duvida';
  const pri = PRIORITIES.includes(priority) ? priority : 'normal';
  const ip = req.ip || req.headers['x-forwarded-for'] || null;
  const ua = req.headers['user-agent'] || null;

  const info = db.prepare(`
    INSERT INTO support_inquiries (user_id, name, email, subject, category, priority, message, ip, user_agent)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    req.appUser?.id || null,
    String(name || '').slice(0, 120),
    String(email).slice(0, 200).toLowerCase().trim(),
    String(subject).slice(0, 200),
    cat,
    pri,
    String(message).slice(0, 5000),
    ip, ua
  );

  // primeira mensagem do user no thread
  db.prepare(`
    INSERT INTO support_inquiry_messages (inquiry_id, author_type, author_id, message)
    VALUES (?, 'user', ?, ?)
  `).run(info.lastInsertRowid, req.appUser?.id || null, String(message).slice(0, 5000));

  audit.log({ req, action: 'support_inquiry.create', target_id: info.lastInsertRowid, details: { category: cat, priority: pri } });
  res.json({ ok: true, id: info.lastInsertRowid, protocol: 'SUP-' + String(info.lastInsertRowid).padStart(6, '0') });
});

// Lista tickets do user autenticado
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, subject, category, priority, status, created_at, responded_at, closed_at
    FROM support_inquiries
    WHERE user_id = ? OR email = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.appUser.id, (req.appUser.email || '').toLowerCase());
  res.json(rows);
});

// Detalhe + mensagens (proprio user OU owner)
router.get('/:id', requireAuth, (req, res) => {
  const inq = db.prepare('SELECT * FROM support_inquiries WHERE id=?').get(req.params.id);
  if (!inq) return res.status(404).json({ error: 'nao encontrado' });
  const isOwner = req.appUser?.role === 'owner';
  const isMine = inq.user_id === req.appUser.id || (req.appUser.email && inq.email === req.appUser.email.toLowerCase());
  if (!isOwner && !isMine) return res.status(403).json({ error: 'sem acesso' });
  const messages = db.prepare(`
    SELECT id, author_type, author_id, message, created_at
    FROM support_inquiry_messages
    WHERE inquiry_id = ?
    ORDER BY created_at ASC
  `).all(inq.id);
  res.json({ ...inq, messages });
});

// User responde no thread
router.post('/:id/reply', requireAuth, (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message obrigatorio' });
  const inq = db.prepare('SELECT * FROM support_inquiries WHERE id=?').get(req.params.id);
  if (!inq) return res.status(404).json({ error: 'nao encontrado' });
  const isMine = inq.user_id === req.appUser.id || (req.appUser.email && inq.email === req.appUser.email.toLowerCase());
  if (!isMine) return res.status(403).json({ error: 'sem acesso' });
  if (inq.status === 'closed') return res.status(400).json({ error: 'ticket fechado, abra um novo' });

  db.prepare(`
    INSERT INTO support_inquiry_messages (inquiry_id, author_type, author_id, message)
    VALUES (?, 'user', ?, ?)
  `).run(inq.id, req.appUser.id, String(message).slice(0, 5000));
  db.prepare(`UPDATE support_inquiries SET status = 'open' WHERE id = ?`).run(inq.id);
  res.json({ ok: true });
});

// =========== ADMIN (owner) ===========

router.get('/admin/list', requireOwner, (req, res) => {
  const status = req.query.status;
  const where = status ? `WHERE status = ?` : '';
  const args = status ? [status] : [];
  const rows = db.prepare(`
    SELECT i.*, u.display_name AS user_name, u.email AS user_email
    FROM support_inquiries i
    LEFT JOIN users u ON u.id = i.user_id
    ${where}
    ORDER BY
      CASE i.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      i.created_at DESC
    LIMIT 200
  `).all(...args);
  res.json(rows.map(r => ({
    ...r,
    protocol: 'SUP-' + String(r.id).padStart(6, '0')
  })));
});

router.get('/admin/stats', requireOwner, (req, res) => {
  const open = db.prepare(`SELECT COUNT(*) AS c FROM support_inquiries WHERE status='open'`).get().c;
  const inProgress = db.prepare(`SELECT COUNT(*) AS c FROM support_inquiries WHERE status='in_progress'`).get().c;
  const closed = db.prepare(`SELECT COUNT(*) AS c FROM support_inquiries WHERE status='closed'`).get().c;
  const urgent = db.prepare(`SELECT COUNT(*) AS c FROM support_inquiries WHERE status!='closed' AND priority='urgent'`).get().c;
  res.json({ open, in_progress: inProgress, closed, urgent_pending: urgent });
});

router.post('/admin/:id/respond', requireOwner, (req, res) => {
  const { message, status } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message obrigatorio' });
  const inq = db.prepare('SELECT * FROM support_inquiries WHERE id=?').get(req.params.id);
  if (!inq) return res.status(404).json({ error: 'nao encontrado' });

  db.prepare(`
    INSERT INTO support_inquiry_messages (inquiry_id, author_type, author_id, message)
    VALUES (?, 'admin', ?, ?)
  `).run(inq.id, req.appUser.id, String(message).slice(0, 5000));

  const newStatus = STATUSES.includes(status) ? status : 'waiting_user';
  db.prepare(`
    UPDATE support_inquiries SET
      status = ?,
      responded_at = COALESCE(responded_at, strftime('%s','now')),
      closed_at = CASE WHEN ? = 'closed' THEN strftime('%s','now') ELSE NULL END,
      assigned_to = COALESCE(assigned_to, ?)
    WHERE id = ?
  `).run(newStatus, newStatus, req.appUser.id, inq.id);

  // notifica o user dono do ticket (se tiver user_id)
  if (inq.user_id) {
    try {
      db.prepare(`INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, 'info', ?, ?, ?)`)
        .run(inq.user_id, 'Resposta no seu ticket #' + inq.id, String(message).slice(0, 200), '/suporte.html#' + inq.id);
    } catch {}
  }

  audit.log({ req, action: 'support_inquiry.respond', target_id: inq.id, details: { status: newStatus } });
  res.json({ ok: true });
});

router.put('/admin/:id/status', requireOwner, (req, res) => {
  const { status, priority } = req.body || {};
  const inq = db.prepare('SELECT id FROM support_inquiries WHERE id=?').get(req.params.id);
  if (!inq) return res.status(404).json({ error: 'nao encontrado' });
  db.prepare(`
    UPDATE support_inquiries SET
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      closed_at = CASE WHEN ? = 'closed' THEN strftime('%s','now') ELSE closed_at END
    WHERE id = ?
  `).run(
    STATUSES.includes(status) ? status : null,
    PRIORITIES.includes(priority) ? priority : null,
    status === 'closed' ? 'closed' : null,
    inq.id
  );
  res.json({ ok: true });
});

router.get('/admin/_meta', requireOwner, (req, res) => res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES }));

module.exports = router;
