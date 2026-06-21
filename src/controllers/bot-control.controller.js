// Controles do bot: start/stop/restart + status.
const express = require('express');
const { requireAuth, requireOwner } = require('../middlewares/auth.middleware');
const bot = require('../services/bot.service');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth);

router.get('/status', (req, res) => {
  const c = bot.client;
  res.json({
    ready: !!c?.isReady?.(),
    ping_ms: c?.ws?.ping ?? null,
    user_tag: c?.user?.tag || null,
    guild_count: c?.guilds?.cache?.size ?? 0
  });
});

router.post('/start', requireOwner, async (req, res) => {
  try {
    await bot.start();
    audit.log({ req, action: 'bot.start' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/stop', requireOwner, async (req, res) => {
  try {
    if (bot.client && bot.client.isReady?.()) await bot.client.destroy();
    audit.log({ req, action: 'bot.stop' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/restart', requireOwner, async (req, res) => {
  try {
    if (bot.restart) await bot.restart();
    else {
      if (bot.client && bot.client.isReady?.()) await bot.client.destroy();
      await bot.start();
    }
    audit.log({ req, action: 'bot.restart' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
