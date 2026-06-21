// Metricas Prometheus + cleanup automatico.

const { applyMigrations } = require('../src/database/migrate');
applyMigrations();
const { db } = require('../src/database/connection');
const metrics = require('../src/services/metrics.service');

test('Metrics: counter inc + render produz formato Prometheus', () => {
  metrics.reset();
  metrics.inc('botdash_sales_total', { provider: 'mercadopago', status: 'paid' });
  metrics.inc('botdash_sales_total', { provider: 'mercadopago', status: 'paid' });
  metrics.inc('botdash_sales_total', { provider: 'asaas', status: 'paid' });
  const out = metrics.render();
  assert(out.includes('# HELP botdash_sales_total'), 'HELP line presente');
  assert(out.includes('# TYPE botdash_sales_total counter'), 'TYPE counter');
  assert(out.includes('botdash_sales_total{provider="mercadopago",status="paid"} 2'), 'counter MP=2');
  assert(out.includes('botdash_sales_total{provider="asaas",status="paid"} 1'), 'counter Asaas=1');
});

test('Metrics: gauge set substitui valor anterior', () => {
  metrics.reset();
  metrics.set('botdash_active_wallet_providers', {}, 3);
  metrics.set('botdash_active_wallet_providers', {}, 5);
  const out = metrics.render();
  assert(out.includes('botdash_active_wallet_providers 5'), 'gauge =5');
  assert(!out.includes('botdash_active_wallet_providers 3'), 'valor antigo removido');
});

test('Metrics: histogram emite buckets + sum + count', () => {
  metrics.reset();
  metrics.observe('botdash_request_duration_ms', 15, { path: '/sales' });
  metrics.observe('botdash_request_duration_ms', 200, { path: '/sales' });
  metrics.observe('botdash_request_duration_ms', 2000, { path: '/sales' });
  const out = metrics.render();
  assert(out.includes('botdash_request_duration_ms_count{path="/sales"} 3'));
  assert(out.includes('botdash_request_duration_ms_sum{path="/sales"} 2215'));
  // bucket le=25 deve ter 1 (so o 15)
  assert(out.includes('botdash_request_duration_ms_bucket{path="/sales",le="25"} 1'));
  // bucket le=250 deve ter 2 (15 + 200)
  assert(out.includes('botdash_request_duration_ms_bucket{path="/sales",le="250"} 2'));
  // bucket +Inf deve ter 3
  assert(out.includes('botdash_request_duration_ms_bucket{path="/sales",le="+Inf"} 3'));
});

test('Metrics: labels com aspas sao escapadas', () => {
  metrics.reset();
  metrics.inc('botdash_sales_total', { provider: 'with"quote', status: 'paid' });
  const out = metrics.render();
  assert(out.includes('with\\"quote'), 'aspas escapada');
});

test('Cleanup: deleta webhook_events com idade > 30d', async () => {
  // Cria evento recente + evento antigo
  const recent = Math.floor(Date.now() / 1000) - 86400;        // 1d atras
  const old    = Math.floor(Date.now() / 1000) - 35 * 86400;   // 35d atras
  db.prepare(`INSERT INTO webhook_events (gateway, event_id, received_at, status) VALUES ('test','evt-recent',?, 'processed')`).run(recent);
  db.prepare(`INSERT INTO webhook_events (gateway, event_id, received_at, status) VALUES ('test','evt-old',?, 'processed')`).run(old);

  const cleanup = require('../src/jobs/wallet-cleanup');
  const r = await cleanup.run();
  assert(r.webhook_events_deleted >= 1, 'deletou pelo menos 1: ' + r.webhook_events_deleted);

  const recentRow = db.prepare(`SELECT id FROM webhook_events WHERE event_id='evt-recent'`).get();
  const oldRow    = db.prepare(`SELECT id FROM webhook_events WHERE event_id='evt-old'`).get();
  assert(recentRow, 'recente mantido');
  assert(!oldRow, 'antigo deletado');
});

test('Cleanup: deleta outbound_webhook_attempts antigos', async () => {
  // Cria hook + 2 attempts (1 recente, 1 antigo)
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (500,'cl@t','x','owner',1)`).run(); } catch {}
  const wh = db.prepare(`INSERT INTO outbound_webhooks (user_id,url,secret,events) VALUES (500,'http://x','s','[]')`).run();
  const recent = Math.floor(Date.now() / 1000) - 86400;
  const old    = Math.floor(Date.now() / 1000) - 35 * 86400;
  db.prepare(`INSERT INTO outbound_webhook_attempts (webhook_id, event, payload, attempt_number, succeeded, created_at) VALUES (?,?,?,?,?,?)`)
    .run(wh.lastInsertRowid, 'sale.paid', '{}', 1, 1, recent);
  db.prepare(`INSERT INTO outbound_webhook_attempts (webhook_id, event, payload, attempt_number, succeeded, created_at) VALUES (?,?,?,?,?,?)`)
    .run(wh.lastInsertRowid, 'sale.paid', '{}', 1, 1, old);

  const r = await require('../src/jobs/wallet-cleanup').run();
  assert(r.outbound_attempts_deleted >= 1, 'deletou pelo menos 1');
});

test('Cleanup: api_key_audit > 90d removido', async () => {
  try { db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,role,active) VALUES (501,'cl2@t','x','owner',1)`).run(); } catch {}
  const keys = require('../src/services/api-keys.service');
  const k = keys.generate({ user_id: 501, label: 'cleanup' });
  const old = Math.floor(Date.now() / 1000) - 100 * 86400;
  const recent = Math.floor(Date.now() / 1000) - 1;
  db.prepare(`INSERT INTO api_key_audit (api_key_id, user_id, method, path, status_code, test_mode, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(k.id, 501, 'GET', '/old', 200, 0, old);
  db.prepare(`INSERT INTO api_key_audit (api_key_id, user_id, method, path, status_code, test_mode, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(k.id, 501, 'GET', '/recent', 200, 0, recent);

  const r = await require('../src/jobs/wallet-cleanup').run();
  assert(r.api_key_audit_deleted >= 1, 'deletou audit antigo');
  const oldRow = db.prepare(`SELECT id FROM api_key_audit WHERE api_key_id=? AND path='/old'`).get(k.id);
  const recentRow = db.prepare(`SELECT id FROM api_key_audit WHERE api_key_id=? AND path='/recent'`).get(k.id);
  assert(!oldRow, 'antigo removido');
  assert(recentRow, 'recente mantido');
});
