// Middleware que aceita auth via:
//   1) Authorization: Bearer bd_<prefix>_<secret>  -> usa api_keys.verify
//   2) Cookie de sessao (passa pro requireAuth padrao)
//
// Quando vem por API key, popula req.appUser com user_id + guildId + scopes.

const apiKeys = require('../services/api-keys.service');
const { db } = require('../database/connection');

function apiKeyOrAuth(requiredScope = null) {
  return (req, res, next) => {
    const auth = String(req.headers.authorization || '');
    if (auth.startsWith('Bearer bd_')) {
      const token = auth.slice('Bearer '.length).trim();
      const k = apiKeys.verify(token);
      if (!k) return res.status(401).json({ error: 'api key invalida ou expirada' });
      if (requiredScope && !k.scopes.includes(requiredScope)) {
        return res.status(403).json({ error: 'api key sem scope', required_scope: requiredScope });
      }
      // Hidrata req.appUser + req.guildId
      try {
        const u = db.prepare(`SELECT id, email, role FROM users WHERE id = ?`).get(k.user_id);
        req.appUser = u || { id: k.user_id };
      } catch { req.appUser = { id: k.user_id }; }
      req.guildId = k.guild_id || req.guildId || null;
      req.apiKey = { id: k.id, scopes: k.scopes, test_mode: k.test_mode };

      // Audit log de uso (apos response enviada — nao bloqueia)
      const started = Date.now();
      res.on('finish', () => {
        try {
          db.prepare(`
            INSERT INTO api_key_audit
              (api_key_id, user_id, method, path, status_code, ip, user_agent, test_mode, duration_ms)
            VALUES (?,?,?,?,?,?,?,?,?)
          `).run(
            k.id, k.user_id, req.method, req.path, res.statusCode,
            req.ip || null, String(req.headers['user-agent'] || '').slice(0, 200),
            k.test_mode ? 1 : 0, Date.now() - started
          );
        } catch {}
      });

      return next();
    }
    // Fallback: requireAuth normal (cookie)
    const { requireAuth } = require('./auth.middleware');
    return requireAuth(req, res, next);
  };
}

// Middleware leve que so popula req.apiKey se vier Bearer bd_*, sem
// validar scope. Util pra rate-limit ANTES do auth.
function peekApiKey(req, res, next) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer bd_')) {
    const token = auth.slice('Bearer '.length).trim();
    const k = apiKeys.verify(token);
    if (k) req.apiKey = { id: k.id, scopes: k.scopes };
  }
  next();
}

module.exports = { apiKeyOrAuth, peekApiKey };
