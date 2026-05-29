const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
  ]
});

const GUILD_ID = 'ID_DO_SEU_SERVIDOR';
const TOKEN   = 'TOKEN_DO_SEU_BOT';


app.get('/api/stats', async (req, res) => {
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();
  res.json({
    total: guild.memberCount,
    online: members.filter(m => m.presence?.status === 'online').size,
  });
});


app.post('/api/anuncio', async (req, res) => {
  const { canal, mensagem } = req.body;
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = guild.channels.cache.find(c => c.name === canal.replace('#',''));
  if (!channel) return res.status(404).json({ erro: 'Canal não encontrado' });
  await channel.send(mensagem);
  res.json({ ok: true });
});


app.post('/api/ban', async (req, res) => {
  const { userId, motivo } = req.body;
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.ban(userId, { reason: motivo });
  res.json({ ok: true });
});

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
  app.listen(3000, () => console.log('API rodando em http://localhost:3000'));
});

client.login(TOKEN);