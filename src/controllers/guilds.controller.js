const express = require('express');
const guildService = require('../services/guild.service');
const audit = require('../services/audit.service');

const router = express.Router();

// Lista guilds do usuario logado
router.get('/', (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  res.json({
    guilds: req.userGuilds || [],
    active_guild_id: req.guildId || null
  });
});

// Switch para outro server
router.post('/switch/:id', (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'nao autenticado' });
  if (!guildService.userHasGuildAccess(req.appUser.id, req.params.id)) {
    return res.status(403).json({ error: 'sem acesso a esse servidor' });
  }
  req.session.active_guild_id = req.params.id;
  audit.log({ req, action: 'guild.switch', target_type: 'guild', target_id: req.params.id });
  res.json({ ok: true, guild_id: req.params.id });
});

// Lista TODAS as guilds onde o bot esta (admin)
router.get('/all', (req, res) => {
  if (req.appUser?.role !== 'owner') return res.status(403).json({ error: 'so owner' });
  res.json(guildService.listGuilds());
});

module.exports = router;
