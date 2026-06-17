// Sandbox simulator: dispara fulfillment direto em uma sale pending sem
// passar pela PSP. Util pra integradores testarem outbound webhooks + SSE
// sem precisar fazer pagamento real ou configurar PSP em sandbox.
//
// So funciona com sales criadas via API key sandbox (bd_test_*).
// Requer scope write:dispute (acao destrutiva).

const express = require('express');
const { db } = require('../database/connection');
const { apiKeyOrAuth } = require('../middlewares/api-key.middleware');
const { fulfillSale } = require('../services/fulfillment.service');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/sandbox/simulate-payment/:sale_id
//   body: { event: 'paid'|'refunded'|'med_returned'|'expired' }
router.post('/simulate-payment/:sale_id', apiKeyOrAuth('write:dispute'), async (req, res) => {
  if (!req.apiKey?.test_mode) {
    return res.status(403).json({
      error: 'simulator so funciona com api key sandbox (bd_test_*)',
      hint: 'crie uma chave sandbox em /api-and-webhooks.html'
    });
  }

  const sale = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.sale_id);
  if (!sale) return res.status(404).json({ error: 'sale nao encontrada' });
  if (req.guildId && sale.guild_id && sale.guild_id !== req.guildId) {
    return res.status(403).json({ error: 'sale de outra guild' });
  }

  const event = String(req.body?.event || 'paid');
  const VALID = ['paid', 'refunded', 'med_returned', 'expired'];
  if (!VALID.includes(event)) {
    return res.status(400).json({ error: 'event invalido', valid: VALID });
  }

  try {
    if (event === 'paid') {
      if (sale.status === 'paid') return res.json({ ok: true, already: true });
      const r = await fulfillSale(sale.id, { metadata: { simulator: true } });
      return res.json({ ok: !!r.ok, event, sale_id: sale.id });
    }
    if (event === 'expired') {
      db.prepare(`UPDATE sales SET status='expired' WHERE id=? AND status='pending'`).run(sale.id);
      return res.json({ ok: true, event, sale_id: sale.id });
    }
    if (event === 'refunded') {
      db.prepare(`UPDATE sales SET status='refunded' WHERE id=?`).run(sale.id);
      try {
        const payload = {
          user_id: req.appUser.id, guild_id: sale.guild_id, sale_id: sale.id,
          amount_cents: sale.amount_cents, provider: sale.provider,
          provider_charge_id: sale.provider_charge_id, simulator: true
        };
        require('../services/outbound-webhooks.service').dispatch('sale.refunded', payload).catch(() => {});
        require('../services/sse.service').emit('sale.refunded', payload);
      } catch {}
      return res.json({ ok: true, event, sale_id: sale.id });
    }
    if (event === 'med_returned') {
      const r = await require('../services/med.service').handleMedReturn(sale.id, { reason: 'sandbox simulator' });
      return res.json({ ok: !!r.ok, event, sale_id: sale.id });
    }
  } catch (e) {
    logger.error({ err: e.message, sale_id: sale.id, event }, 'simulator falhou');
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sandbox/create-sale — cria uma sale sandbox de teste sem checkout real
//   body: { provider: 'mercadopago', amount_cents: 5000, discord_id: '123...' }
router.post('/create-sale', apiKeyOrAuth('write:dispute'), (req, res) => {
  if (!req.apiKey?.test_mode) {
    return res.status(403).json({ error: 'apenas api key sandbox' });
  }
  const { provider = 'mercadopago', amount_cents = 1000, discord_id = '000000000000000000', product_id = null } = req.body || {};
  if (!/^\d{16,20}$/.test(String(discord_id))) {
    return res.status(400).json({ error: 'discord_id invalido' });
  }
  const chargeId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const info = db.prepare(`
    INSERT INTO sales (product_id, discord_id, amount_cents, status, cart_items,
                       guild_id, provider, provider_charge_id)
    VALUES (?,?,?, 'pending', '[]', ?, ?, ?)
  `).run(product_id || null, discord_id, amount_cents, req.guildId || null, provider, chargeId);
  res.status(201).json({
    sale_id: info.lastInsertRowid,
    charge_id: chargeId,
    provider,
    amount_cents,
    sandbox: true,
    next_step: `POST /api/sandbox/simulate-payment/${info.lastInsertRowid}`
  });
});

module.exports = router;
