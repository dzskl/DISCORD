// Entrypoint do servidor. Boota tudo na ordem certa:
//   1. carrega .env
//   2. aplica migrations pendentes
//   3. cria app Express
//   4. liga o bot Discord
//   5. inicia jobs/cron
//   6. listen na PORT

require('dotenv').config();

const logger = require('./utils/logger');
const { applyMigrations } = require('./database/migrate');
const { buildApp } = require('./app');
const bot = require('./services/bot.service');
const scheduler = require('./jobs/scheduler');

const PORT = parseInt(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
    logger.fatal('SESSION_SECRET obrigatorio em producao (>= 16 chars)');
    process.exit(1);
  }
  if (process.env.DEV_BYPASS_AUTH === '1') {
    logger.warn('DEV_BYPASS_AUTH=1 sera ignorado em producao');
  }
}

// migrations first
try {
  applyMigrations();
} catch (e) {
  logger.fatal({ err: e.message }, 'falha aplicando migrations');
  process.exit(1);
}

const app = buildApp();

bot.start().catch(e => logger.error({ err: e.message }, 'bot login falhou'));
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
