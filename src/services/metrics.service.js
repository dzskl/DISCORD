// Metricas no formato Prometheus exposition text (sem dep externa).
//
// Counters: incrementados via inc(name, labels?, value?)
// Gauges: setados via set(name, labels?, value)
// Histograms: observados via observe(name, value, labels?)
//
// /metrics endpoint serializa todos com HELP/TYPE corretos.
// Persistencia: nada — sao agregados em memoria. Pra agregacao
// multi-replica usar Prometheus federation ou pushgateway.

const counters = new Map();        // 'name|k1=v1,k2=v2' -> number
const gauges   = new Map();
const histograms = new Map();      // 'name|labels' -> { count, sum, buckets:{le_x: count} }

const HELP = {
  botdash_sales_total:           'Total de sales criadas por provider/status',
  botdash_sales_paid_cents_total:'Volume bruto total em centavos por provider',
  botdash_refunds_total:         'Total de refunds processados por provider',
  botdash_med_total:             'Total de MEDs por provider',
  botdash_webhook_received_total:'Webhooks PSP recebidos por gateway/status',
  botdash_webhook_outbound_total:'Outbound webhooks enviados por status',
  botdash_api_key_uses_total:    'Requests autenticadas por API key (test_mode label)',
  botdash_rate_limit_hits_total: 'Rate limit excedido por scope',
  botdash_active_wallet_providers:'Quantos providers tem credentials configuradas',
  botdash_sse_connections:       'Conexoes SSE abertas no momento',
  botdash_request_duration_ms:   'Latencia de request em ms (apenas Wallet API)'
};

const TYPE = {
  botdash_sales_total:           'counter',
  botdash_sales_paid_cents_total:'counter',
  botdash_refunds_total:         'counter',
  botdash_med_total:             'counter',
  botdash_webhook_received_total:'counter',
  botdash_webhook_outbound_total:'counter',
  botdash_api_key_uses_total:    'counter',
  botdash_rate_limit_hits_total: 'counter',
  botdash_active_wallet_providers:'gauge',
  botdash_sse_connections:       'gauge',
  botdash_request_duration_ms:   'histogram'
};

const HISTOGRAM_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

function labelKey(labels) {
  if (!labels || !Object.keys(labels).length) return '';
  return Object.keys(labels).sort().map(k => `${k}="${String(labels[k]).replace(/"/g,'\\"')}"`).join(',');
}

function key(name, labels) { return `${name}|${labelKey(labels)}`; }

function inc(name, labels = {}, value = 1) {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) || 0) + value);
}

function set(name, labels = {}, value) {
  gauges.set(key(name, labels), value);
}

function observe(name, value, labels = {}) {
  const k = key(name, labels);
  let h = histograms.get(k);
  if (!h) {
    h = { count: 0, sum: 0, buckets: {} };
    for (const b of HISTOGRAM_BUCKETS) h.buckets[b] = 0;
    histograms.set(k, h);
  }
  h.count++;
  h.sum += value;
  for (const b of HISTOGRAM_BUCKETS) if (value <= b) h.buckets[b]++;
}

function format(name, labelStr, value) {
  return labelStr ? `${name}{${labelStr}} ${value}` : `${name} ${value}`;
}

function render() {
  const out = [];
  const seen = new Set();

  // Agrupa por nome pra emitir HELP/TYPE uma vez
  const byName = new Map();
  const all = [
    ...[...counters].map(([k, v]) => ({ kind: 'counter', k, v })),
    ...[...gauges].map(([k, v]) => ({ kind: 'gauge', k, v })),
    ...[...histograms].map(([k, v]) => ({ kind: 'histogram', k, v }))
  ];
  for (const item of all) {
    const [name] = item.k.split('|');
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(item);
  }

  for (const [name, items] of byName) {
    out.push(`# HELP ${name} ${HELP[name] || ''}`);
    out.push(`# TYPE ${name} ${TYPE[name] || items[0].kind}`);
    for (const item of items) {
      const [, labelStr] = item.k.split('|');
      if (item.kind === 'histogram') {
        for (const b of HISTOGRAM_BUCKETS) {
          const ls = labelStr ? `${labelStr},le="${b}"` : `le="${b}"`;
          out.push(format(`${name}_bucket`, ls, item.v.buckets[b]));
        }
        const lsInf = labelStr ? `${labelStr},le="+Inf"` : `le="+Inf"`;
        out.push(format(`${name}_bucket`, lsInf, item.v.count));
        out.push(format(`${name}_count`, labelStr, item.v.count));
        out.push(format(`${name}_sum`, labelStr, item.v.sum));
      } else {
        out.push(format(name, labelStr, item.v));
      }
    }
  }
  out.push('');
  return out.join('\n');
}

// Snapshots dinamicos calculados na hora do render (gauges que precisam de DB)
function refreshGauges() {
  try {
    const { db } = require('../database/connection');
    const registry = require('../providers/wallet');
    const wallet = require('../config/wallet-providers');

    let configured = 0;
    for (const p of wallet.listProviders()) {
      if (registry.isSupported(p.id) && registry.isConfigured(p.id)) configured++;
    }
    set('botdash_active_wallet_providers', {}, configured);

    set('botdash_sse_connections', {}, require('./sse.service').bus.listenerCount('event'));
  } catch {}
}

function reset() { counters.clear(); gauges.clear(); histograms.clear(); }

module.exports = { inc, set, observe, render, refreshGauges, reset };
