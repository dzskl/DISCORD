// Maintenance mode: quando system_flags.maintenance_mode='1', bloqueia
// requests de escrita (POST/PUT/PATCH/DELETE) com 503.
//
// Excecoes (sempre passam mesmo em maintenance):
//   - /healthz, /readyz, /metrics (probes K8s)
//   - /auth/login, /auth/logout (admin precisa logar)
//   - /api/admin/* (admin desliga o flag)

const flags = require('../services/system-flags.service');

const ALLOW_PATHS = [
  /^\/healthz/,
  /^\/readyz/,
  /^\/metrics/,
  /^\/auth\//,
  /^\/api\/admin\//,
  /^\/admin\//,
  /^\/login/,
  /^\/static\//
];

function maintenanceMiddleware(req, res, next) {
  if (!flags.isOn('maintenance_mode')) return next();
  // GET/HEAD livres
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Excecoes
  if (ALLOW_PATHS.some(re => re.test(req.path))) return next();
  // Bloqueia escrita
  res.setHeader('Retry-After', '300');
  return res.status(503).json({
    error: 'maintenance mode ativo',
    code: 'maintenance_mode',
    message: 'BotDash em manutencao. Tente novamente em alguns minutos.'
  });
}

module.exports = { maintenanceMiddleware };
