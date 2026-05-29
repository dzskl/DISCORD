require('dotenv').config();

const { buildApp } = require('./server');
const bot = require('./bot');
const scheduler = require('./scheduler');

const PORT = parseInt(process.env.PORT) || 3000;
const app = buildApp();

bot.start().catch(e => console.error('[BOT] falha no login:', e.message));
scheduler.start();

app.listen(PORT, () => {
  console.log(`[HTTP] dashboard em http://localhost:${PORT}`);
  console.log(`[HTTP] loja em http://localhost:${PORT}/loja.html`);
});
