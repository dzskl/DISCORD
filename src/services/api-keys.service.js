// API keys: gera, valida, lista, revoga.
//
// Formato: bd_<8charsPrefix>_<32charsSecret>
//   - prefix indexado pra lookup rapido
//   - secret nunca volta apos criar (so hash sha256 fica no banco)
//
// Usado por:
//   - vendedor: integrar BotDash com seus sistemas (Zapier, n8n, app proprio)
//   - GET /api/checkout/wallet/sales via Authorization: Bearer bd_xxx
//   - POST /api/checkout/wallet/refund/:id, etc.

const crypto = require('crypto');
const { db } = require('../database/connection');

const ALL_SCOPES = [
  'read:sales',       // listar vendas, status, timeline
  'write:refund',     // disparar refund
  'read:balance',     // saldo + saldo por PSP
  'read:providers',   // listar PSPs configuradas (sem expor creds)
  'write:dispute'     // marcar MED manual
];

function generate({ user_id, guild_id, label, scopes = ['read:sales'], expires_in_days, test_mode = false } = {}) {
  if (!user_id) throw Object.assign(new Error('user_id obrigatorio'), { code: 'no_user' });
  const invalid = (scopes || []).filter(s => !ALL_SCOPES.includes(s));
  if (invalid.length) throw Object.assign(new Error(`scopes invalidos: ${invalid.join(',')}`), { code: 'bad_scope' });

  const secret = crypto.randomBytes(24).toString('base64url').slice(0, 32);
  // Sandbox keys: prefix `bd_test_<hex>` em vez de `bd_<hex>`. Detectavel pela
  // string `bd_test_` no inicio do token, sem precisar query no banco.
  const prefix = test_mode
    ? 'bd_test_' + crypto.randomBytes(4).toString('hex')
    : 'bd_' + crypto.randomBytes(4).toString('hex');
  const full = `${prefix}_${secret}`;
  const hash = crypto.createHash('sha256').update(full).digest('hex');
  const expires_at = expires_in_days ? Math.floor(Date.now() / 1000) + expires_in_days * 86400 : null;

  const info = db.prepare(`
    INSERT INTO api_keys (user_id, guild_id, key_prefix, key_hash, label, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user_id, guild_id || null, prefix, hash, label || null, JSON.stringify(scopes), expires_at);

  return {
    id: info.lastInsertRowid,
    prefix,
    full_key: full,         // **so volta uma vez aqui**
    label,
    scopes,
    expires_at
  };
}

function verify(token) {
  if (!token || !token.startsWith('bd_')) return null;
  // Formato: <prefix>_<32 chars de secret>. Secret tem comprimento fixo,
  // entao o prefix sao todos os chars exceto os ultimos 33 (=_ + 32).
  // Isso evita ambiguidade quando base64url do secret contem '_'.
  if (token.length < 35) return null;
  const prefix = token.slice(0, -33);
  if (token[token.length - 33] !== '_') return null;
  const isTestMode = prefix.startsWith('bd_test_');
  const hash = crypto.createHash('sha256').update(token).digest('hex');

  const row = db.prepare(`
    SELECT id, user_id, guild_id, scopes, expires_at, active
    FROM api_keys
    WHERE key_prefix = ? AND key_hash = ? AND active = 1
  `).get(prefix, hash);
  if (!row) return null;
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return null;

  let scopes = [];
  try { scopes = JSON.parse(row.scopes || '[]'); } catch {}

  // Touch last_used_at (sem await — fire-and-forget)
  try {
    db.prepare(`UPDATE api_keys SET last_used_at = strftime('%s','now') WHERE id = ?`).run(row.id);
  } catch {}

  return {
    id: row.id,
    user_id: row.user_id,
    guild_id: row.guild_id,
    scopes,
    test_mode: isTestMode
  };
}

function list(userId) {
  return db.prepare(`
    SELECT id, key_prefix, label, scopes, active, last_used_at, created_at, expires_at, guild_id
    FROM api_keys WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map(r => ({
    ...r,
    scopes: (() => { try { return JSON.parse(r.scopes || '[]'); } catch { return []; } })()
  }));
}

function revoke(userId, id) {
  return db.prepare(`UPDATE api_keys SET active = 0 WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
}

// Rotate: gera novo prefix+secret pra mesma "logical key". Mantem id antigo
// como revogado (active=0) e cria uma nova com mesmo label/scopes/etc.
function rotate(userId, id) {
  const k = db.prepare(`SELECT * FROM api_keys WHERE id = ? AND user_id = ? AND active = 1`).get(id, userId);
  if (!k) return null;
  // Revoga a antiga
  db.prepare(`UPDATE api_keys SET active = 0 WHERE id = ?`).run(id);
  // Cria nova com mesmas configs
  let scopes = [];
  try { scopes = JSON.parse(k.scopes || '[]'); } catch {}
  const isTest = String(k.key_prefix).startsWith('bd_test_');
  const expiresInDays = k.expires_at
    ? Math.max(1, Math.ceil((k.expires_at - Math.floor(Date.now() / 1000)) / 86400))
    : null;
  return generate({
    user_id: userId,
    guild_id: k.guild_id,
    label: k.label ? k.label + ' (rotated)' : 'rotated',
    scopes,
    expires_in_days: expiresInDays,
    test_mode: isTest
  });
}

module.exports = { ALL_SCOPES, generate, verify, list, revoke, rotate };
