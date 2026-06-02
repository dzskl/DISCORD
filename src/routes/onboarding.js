const express = require('express');
const { getCredential } = require('../db');

const router = express.Router();

// Gera a URL OAuth2 pra convidar o bot pra um servidor Discord (estilo Loritta)
router.get('/invite-url', (req, res) => {
  const clientId = getCredential('DISCORD_CLIENT_ID');
  if (!clientId) return res.json({ url: null, reason: 'bot nao configurado' });

  // Permissoes necessarias pra todas as features:
  // Manage Roles, Kick, Ban, Moderate, Send Messages, Manage Messages,
  // View Audit Log, Read Message History, Manage Channels, Embed Links,
  // Attach Files, Use External Emojis
  const permissions = '268561921';
  const scope = 'bot+applications.commands';
  const url = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=${scope}&permissions=${permissions}`;
  res.json({ url });
});

module.exports = router;
