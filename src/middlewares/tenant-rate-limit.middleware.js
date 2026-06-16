// Rate limit por tenant (guild_id ou user_id) em memoria.
// Comportamento: token bucket simples por chave, limite + janela configuravel.
// Pronto pra migrar pra Redis sem mudar caller — basta trocar o store.

const { db } = require('../database/connection');
const logger = require('../utils/logger');

const buckets = new Map(); // key -> { tokens, last_refill }
const violationsCache = new Map(); // key -> last_log_ts (pra nao spammar log)

function take(key, capacity, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  const refillRate = capacity / windowMs; // tokens/ms

  if (!bucket) {
    buckets.set(key, { tokens: capacity - 1, last_refill: now });
    return { ok: true, remaining: capacity - 1 };
  }

  const elapsed = now - bucket.last_refill;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
  bucket.last_refill = now;

  if (bucket.tokens < 1) {
    return { ok: false, retry_after_ms: Math.ceil((1 - bucket.tokens) / refillRate) };
  }
  bucket.tokens -= 1;
  return { ok: true, remaining: Math.floor(bucket.tokens) };
}

function tenantLimiter({ scope, capacity, windowMs }) {
  return (req, res, next) => {
    // Identifica o tenant
    let key;
    if (scope === 'guild') {
      const gid = req.guildId || req.body?.guild_id || req.query?.guild_id;
      if (!gid) return next(); // sem guild → libera
      key = `tenant:${scope}:${gid}:${req.path}`;
    } else if (scope === 'user') {
      if (!req.appUser?.id) return next();
      key = `tenant:${scope}:${req.appUser.id}:${req.path}`;
    } else if (scope === 'ip') {
      key = `tenant:ip:${req.ip}:${req.path}`;
    } else if (scope === 'api_key') {
      // So limita se a request veio via Bearer api_key (req.apiKey populado
      // por api-key.middleware). Fallback: ip+path pra rate-limitar mesmo
      // requests com cookie de sessao.
      if (req.apiKey?.id) {
        key = `tenant:apikey:${req.apiKey.id}:${req.path}`;
      } else {
        key = `tenant:ip:${req.ip}:${req.path}`;
      }
    } else {
      return next();
    }

    const r = take(key, capacity, windowMs);
    if (!r.ok) {
      // Log uma vez por minuto por chave pra nao spammar
      const last = violationsCache.get(key) || 0;
      if (Date.now() - last > 60000) {
        violationsCache.set(key, Date.now());
        logger.warn({ key, ip: req.ip }, 'tenant rate limit hit');
        // Persiste pra observabilidade
        try {
          db.prepare(`INSERT INTO rate_limit_violations (key, count, ip) VALUES (?, ?, ?)`)
            .run(key, capacity, req.ip || null);
        } catch {}
      }
      res.set('Retry-After', Math.ceil(r.retry_after_ms / 1000));
      return res.status(429).json({ error: 'rate limit excedido', retry_after_ms: r.retry_after_ms });
    }
    res.set('X-RateLimit-Remaining', String(r.remaining));
    next();
  };
}

// GC dos buckets antigos pra nao vazar memoria
setInterval(() => {
  const cutoff = Date.now() - 3600 * 1000; // 1h sem uso
  for (const [k, b] of buckets) {
    if (b.last_refill < cutoff) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

module.exports = { tenantLimiter, take };
