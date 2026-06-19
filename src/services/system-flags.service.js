// Flags globais com cache TTL 30s pra nao bater DB toda request.
// Flag canonica: 'maintenance_mode' = '1' bloqueia escrita.

const { db } = require('../database/connection');

let cache = {};
let cacheAt = 0;
const TTL_MS = 30_000;

function refresh() {
  try {
    const rows = db.prepare(`SELECT key, value FROM system_flags`).all();
    cache = Object.fromEntries(rows.map(r => [r.key, r.value]));
    cacheAt = Date.now();
  } catch { /* tabela pode nao existir ainda */ }
}

function get(key, defaultVal = null) {
  if (Date.now() - cacheAt > TTL_MS) refresh();
  return cache[key] != null ? cache[key] : defaultVal;
}

function isOn(key) {
  const v = get(key);
  return v === '1' || v === 'true' || v === 'on';
}

function set(key, value, by) {
  db.prepare(`
    INSERT INTO system_flags (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = strftime('%s','now')
  `).run(key, value == null ? null : String(value), by || null);
  cacheAt = 0;   // invalida cache
}

function list() {
  refresh();
  return Object.entries(cache).map(([key, value]) => ({ key, value }));
}

module.exports = { get, set, isOn, list, refresh };
