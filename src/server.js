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
    // Nao mata o processo — gera um secret efemero e avisa.
    // Em prod isso vai invalidar sessoes a cada deploy, mas o app sobe.
    process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
    logger.error('SESSION_SECRET nao configurado em producao — usando ephemero. Sessoes serao invalidadas a cada deploy. Configure a env var!');
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

// backfill nao deve derrubar o app
try {
  require('./services/guild.service').backfillLegacyGuild();
} catch (e) {
  logger.error({ err: e.message }, 'backfill legacy guild falhou — seguindo sem');
}

let app;
try {
  app = buildApp();
} catch (e) {
  logger.fatal({ err: e.message, stack: e.stack }, 'falha construindo app Express');
  process.exit(1);
}

bot.start().catch(e => logger.error({ err: e.message }, 'bot login falhou'));
try { scheduler.start(); } catch (e) { logger.error({ err: e.message }, 'scheduler falhou'); }
try { require('./services/telegram.service').start(); } catch (e) { logger.error({ err: e.message }, 'telegram falhou'); }

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, `dashboard em http://localhost:${PORT}`);
  logger.info(`loja em http://localhost:${PORT}/loja.html`);
});

// Registra SIGTERM/SIGINT handler pra graceful shutdown (K8s / Railway)
try { require('./services/graceful-shutdown.service').register(server); } catch {}

// Captura erros nao tratados pra nao matar o app silenciosamente no Railway
process.on('uncaughtException', (e) => {
  logger.error({ err: e.message, stack: e.stack }, 'uncaughtException');
});
process.on('unhandledRejection', (e) => {
  logger.error({ err: e?.message || e, stack: e?.stack }, 'unhandledRejection');
});

function shutdown(sig) {
  logger.info({ sig }, 'desligando...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
