// Middleware idempotencia (Stripe-style).
//
// Cliente: POST com header `Idempotency-Key: <uuid>` (max 255 chars).
// Backend:
//   - 1a vez: roda o handler, salva (status, response). Retorna normal.
//   - 2a vez com mesma key + mesmo body: retorna a resposta cacheada (no-op).
//   - 2a vez com mesma key + body DIFERENTE: 409 (request_hash conflict).
//   - Expira em 24h.
//
// Aplica so em requests autenticadas (precisa req.appUser pra escope).

const crypto = require('crypto');
const { db } = require('../database/connection');

const TTL_SECONDS = 24 * 3600;

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

function idempotent(routeLabel) {
  return (req, res, next) => {
    const key = String(req.headers['idempotency-key'] || '').trim();
    if (!key) return next();        // sem header = sem protecao (opt-in)
    if (key.length > 255) return res.status(400).json({ error: 'Idempotency-Key muito longo (max 255)' });
    if (!req.appUser?.id) return next();   // precisa de auth pra escope

    const route = `${req.method}:${routeLabel}`;
    const requestHash = hashBody(req.body);

    // Tenta inserir tentatively: race-safe via UNIQUE constraint
    let existing = null;
    try {
      db.prepare(`
        INSERT INTO idempotency_keys
          (user_id, key, route, request_hash, status_code, response_body, expires_at)
        VALUES (?,?,?,?, 0, NULL, ?)
      `).run(req.appUser.id, key, route, requestHash, Math.floor(Date.now() / 1000) + TTL_SECONDS);
    } catch (e) {
      // ja existe — busca o registro
      existing = db.prepare(`
        SELECT * FROM idempotency_keys
        WHERE user_id = ? AND key = ? AND route = ?
      `).get(req.appUser.id, key, route);
    }

    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({
          error: 'Idempotency-Key reutilizada com body diferente',
          code: 'idempotency_conflict'
        });
      }
      if (existing.status_code > 0 && existing.response_body) {
        // Replay da resposta original
        res.setHeader('X-Idempotency-Replay', 'true');
        try {
          return res.status(existing.status_code).json(JSON.parse(existing.response_body));
        } catch {
          return res.status(existing.status_code).send(existing.response_body);
        }
      }
      // Existe mas ainda nao tem response (handler ta rodando em outro req).
      // Stripe-like: 409 "request in progress" pra cliente reentrant.
      return res.status(409).json({ error: 'Idempotency-Key request em andamento', code: 'in_progress' });
    }

    // Wrappa res.json/send pra capturar a resposta final
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);
    let captured = null;
    res.json = (body) => { captured = JSON.stringify(body); return origJson(body); };
    res.send = (body) => {
      try { captured = typeof body === 'string' ? body : JSON.stringify(body); } catch {}
      return origSend(body);
    };

    res.on('finish', () => {
      try {
        db.prepare(`
          UPDATE idempotency_keys
          SET status_code = ?, response_body = ?
          WHERE user_id = ? AND key = ? AND route = ?
        `).run(res.statusCode, captured, req.appUser.id, key, route);
      } catch {}
    });
    next();
  };
}

// Cleanup das keys expiradas — chamado pelo wallet-cleanup
function cleanupExpired() {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`DELETE FROM idempotency_keys WHERE expires_at < ?`).run(now).changes;
}

module.exports = { idempotent, cleanupExpired, hashBody };
