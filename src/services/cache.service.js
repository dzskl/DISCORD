// Cache abstrato com 2 backends: 'memory' (default) ou 'redis' (futuro).
// API consistente pra que codigo callsite nao mude ao trocar.
//
// Uso:
//   const c = require('./cache.service');
//   await c.set('key', value, { ttl: 60 });
//   const val = await c.get('key');
//   await c.del('key');
//
// Eviction: TTL respeitado em ambos. Memory tambem tem max-entries (LRU).

const MAX_ENTRIES = 10_000;
const store = new Map();          // key -> { value, expiresAt }
const accessOrder = [];           // LRU tracking (key na ordem mais recente -> ultima posicao)

function _evictExpired() {
  const now = Date.now();
  for (const [k, entry] of store) {
    if (entry.expiresAt && entry.expiresAt < now) store.delete(k);
  }
}

function _evictLRU() {
  while (store.size > MAX_ENTRIES) {
    const oldest = accessOrder.shift();
    if (oldest) store.delete(oldest);
    else break;
  }
}

function _touch(key) {
  const idx = accessOrder.indexOf(key);
  if (idx >= 0) accessOrder.splice(idx, 1);
  accessOrder.push(key);
}

async function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  _touch(key);
  return entry.value;
}

async function set(key, value, { ttl } = {}) {
  const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
  store.set(key, { value, expiresAt });
  _touch(key);
  if (store.size > MAX_ENTRIES) _evictLRU();
  return true;
}

async function del(key) {
  const had = store.has(key);
  store.delete(key);
  const idx = accessOrder.indexOf(key);
  if (idx >= 0) accessOrder.splice(idx, 1);
  return had;
}

// getOrSet: helper comum — busca, se nao tem, calcula e cacheia
async function getOrSet(key, ttl, computeFn) {
  const cached = await get(key);
  if (cached !== null) return cached;
  const value = await computeFn();
  if (value !== null && value !== undefined) await set(key, value, { ttl });
  return value;
}

function stats() {
  _evictExpired();
  return {
    size: store.size,
    max: MAX_ENTRIES,
    backend: 'memory'
  };
}

// GC periodico de expirados (sem unref garantido, mas pequeno)
const gcInterval = setInterval(_evictExpired, 60_000);
if (gcInterval.unref) gcInterval.unref();

module.exports = { get, set, del, getOrSet, stats, _store: store };
