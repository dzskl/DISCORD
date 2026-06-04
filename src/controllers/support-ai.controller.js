// IA de Atendimento — FAQ matching simples + paywall
const express = require('express');
const { db } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  if (!req.guildId) return res.json(defaults());
  const row = db.prepare('SELECT * FROM support_ai_config WHERE guild_id=?').get(req.guildId);
  if (!row) return res.json(defaults());
  res.json({
    enabled: !!row.enabled,
    paid: !!row.paid,
    greeting: row.greeting || '',
    faq: safeJson(row.faq_json, []),
    escalate_keywords: row.escalate_keywords ? row.escalate_keywords.split(',').map(s => s.trim()).filter(Boolean) : [],
    model: row.model || 'simple',
    signature: row.signature || ''
  });
});

router.put('/', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const cur = db.prepare('SELECT paid FROM support_ai_config WHERE guild_id=?').get(req.guildId);
  if (!cur?.paid) return res.status(402).json({ error: 'IA de Atendimento eh feature paga', upgrade_required: true });
  const b = req.body || {};
  const faq = Array.isArray(b.faq)
    ? b.faq.slice(0, 100).map(f => ({ q: String(f.q || '').slice(0, 500), a: String(f.a || '').slice(0, 2000) })).filter(f => f.q && f.a)
    : [];
  const keywords = Array.isArray(b.escalate_keywords) ? b.escalate_keywords.join(',') : (b.escalate_keywords || '');
  db.prepare(`
    INSERT INTO support_ai_config (guild_id, enabled, greeting, faq_json, escalate_keywords, model, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      greeting = excluded.greeting,
      faq_json = excluded.faq_json,
      escalate_keywords = excluded.escalate_keywords,
      model = excluded.model,
      signature = excluded.signature
  `).run(
    req.guildId,
    b.enabled ? 1 : 0,
    b.greeting || null,
    JSON.stringify(faq),
    keywords || null,
    ['simple', 'gpt'].includes(b.model) ? b.model : 'simple',
    b.signature || null
  );
  audit.log({ req, action: 'support_ai.update' });
  res.json({ ok: true });
});

router.post('/purchase', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  db.prepare(`
    INSERT INTO support_ai_config (guild_id, paid)
    VALUES (?, 1)
    ON CONFLICT(guild_id) DO UPDATE SET paid = 1
  `).run(req.guildId);
  audit.log({ req, action: 'support_ai.purchased' });
  res.json({ ok: true });
});

// Simulador: testa quais FAQs respondem uma pergunta dada
router.post('/test', (req, res) => {
  if (!req.guildId) return res.status(400).json({ error: 'guild_id nao definido' });
  const row = db.prepare('SELECT * FROM support_ai_config WHERE guild_id=?').get(req.guildId);
  if (!row) return res.json({ matched: null });
  const faq = safeJson(row.faq_json, []);
  const q = String(req.body?.question || '').toLowerCase().trim();
  if (!q) return res.json({ matched: null });
  // Matching simples por keyword overlap
  let best = null, bestScore = 0;
  for (const f of faq) {
    const fq = (f.q || '').toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 2);
    let score = 0;
    for (const w of words) if (fq.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  const keywords = row.escalate_keywords ? row.escalate_keywords.split(',').map(s => s.trim().toLowerCase()) : [];
  const escalate = keywords.some(k => k && q.includes(k));
  res.json({ matched: best, score: bestScore, escalate });
});

function defaults() {
  return { enabled: false, paid: false, greeting: '', faq: [], escalate_keywords: [], model: 'simple', signature: '' };
}
function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

module.exports = router;
