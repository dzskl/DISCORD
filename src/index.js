require('dotenv').config();

const logger = require('./logger');
const { buildApp } = require('./server');
const bot = require('./bot');
const scheduler = require('./scheduler');

const PORT = parseInt(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  const missing = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) missing.push('SESSION_SECRET');
  if (!process.env.DISCORD_CLIENT_SECRET) missing.push('DISCORD_CLIENT_SECRET');
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  if (missing.length) {
    logger.fatal({ missing }, 'variaveis obrigatorias ausentes em producao');
    process.exit(1);
  }
  if (process.env.DEV_BYPASS_AUTH === '1') {
    logger.warn('DEV_BYPASS_AUTH=1 sera ignorado em producao');
  }
}

const app = buildApp();

bot.start().catch(e => logger.error({ err: e }, 'bot login falhou'));
scheduler.start();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `dashboard em http://localhost:${PORT}`);
  logger.info(`loja em http://localhost:${PORT}/loja.html`);
});

function shutdown(sig) {
  logger.info({ sig }, 'desligando...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
