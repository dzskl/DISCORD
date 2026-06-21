const express = require('express');
const { getConfig, setConfig } = require('../database/connection');
const { requireAuth } = require('../middlewares/auth.middleware');
const bot = require('../services/bot.service');

const router = express.Router();

router.get('/', requireAuth, (req, res) => res.json(getConfig()));

router.put('/', requireAuth, (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'body invalido' });
  setConfig(req.body);
  res.json(getConfig());
});

router.get('/channels', requireAuth, async (req, res) => {
  try { res.json(await bot.listChannels()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/roles', requireAuth, async (req, res) => {
  try { res.json(await bot.listRoles()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
