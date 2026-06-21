// Tracing simples compativel com OTLP json. Spans armazenados em memoria
// num ring buffer, expostos via /api/admin/logs/traces. Pra exportar pra
// Jaeger/Tempo, opcionalmente envia POST OTLP via TRACE_OTLP_ENDPOINT.
//
// API minimal:
//   const span = tracer.start('refund.process', { sale_id: 1 });
//   try { ... span.setAttribute('provider', 'mp'); ... }
//   finally { span.end(); }
//
// Trace context propagation: req.traceId (W3C traceparent ou gerado).

const crypto = require('crypto');

const RING_SIZE = 2000;
const spans = [];                 // ring buffer

function newTraceId()  { return crypto.randomBytes(16).toString('hex'); }
function newSpanId()   { return crypto.randomBytes(8).toString('hex'); }

class Span {
  constructor(name, { traceId, parentSpanId, attributes = {} }) {
    this.traceId = traceId || newTraceId();
    this.spanId  = newSpanId();
    this.parentSpanId = parentSpanId || null;
    this.name = name;
    this.startNs = Date.now() * 1_000_000;   // OTLP usa nanos
    this.attributes = { ...attributes };
    this.events = [];
    this.status = { code: 0 };               // 0=UNSET, 1=OK, 2=ERROR
    this.ended = false;
  }
  setAttribute(k, v) { this.attributes[k] = v; return this; }
  addEvent(name, attrs = {}) {
    this.events.push({ name, attributes: attrs, time_unix_nano: Date.now() * 1_000_000 });
    return this;
  }
  setStatus(code, message) {
    this.status = { code, message };
    return this;
  }
  end() {
    if (this.ended) return;
    this.ended = true;
    this.endNs = Date.now() * 1_000_000;
    push(this);
  }
}

function push(span) {
  spans.push(span);
  if (spans.length > RING_SIZE) spans.shift();
  // Async export pra OTLP endpoint se configurado
  const ep = process.env.TRACE_OTLP_ENDPOINT;
  if (ep) {
    exportOTLP(ep, [span]).catch(() => {});
  }
}

function start(name, { parent, attributes } = {}) {
  return new Span(name, {
    traceId: parent?.traceId,
    parentSpanId: parent?.spanId,
    attributes
  });
}

function recent(n = 100) { return spans.slice(-Math.min(n, RING_SIZE)); }

function findByTraceId(traceId) { return spans.filter(s => s.traceId === traceId); }

// Converte span pro formato OTLP (lightweight)
function toOTLP(span) {
  const attrs = Object.entries(span.attributes).map(([k, v]) => ({
    key: k,
    value: typeof v === 'string' ? { stringValue: v }
         : typeof v === 'number' ? { intValue: Math.floor(v) }
         : typeof v === 'boolean' ? { boolValue: v }
         : { stringValue: JSON.stringify(v) }
  }));
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId || undefined,
    name: span.name,
    kind: 1,        // INTERNAL
    startTimeUnixNano: String(span.startNs),
    endTimeUnixNano: String(span.endNs || span.startNs),
    attributes: attrs,
    events: span.events.map(e => ({
      timeUnixNano: String(e.time_unix_nano),
      name: e.name,
      attributes: Object.entries(e.attributes).map(([k, v]) => ({ key: k, value: { stringValue: String(v) } }))
    })),
    status: span.status
  };
}

async function exportOTLP(endpoint, spansArr) {
  const payload = {
    resourceSpans: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'botdash-api' } }] },
      scopeSpans: [{
        scope: { name: 'botdash' },
        spans: spansArr.map(toOTLP)
      }]
    }]
  };
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {}
}

// Middleware: cria root span por request HTTP, propaga via req.span
function tracingMiddleware(req, res, next) {
  // W3C traceparent: 00-<32hex>-<16hex>-<2hex>
  let traceId, parentSpanId;
  const tp = String(req.headers['traceparent'] || '').trim();
  const m = tp.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/);
  if (m) { traceId = m[1]; parentSpanId = m[2]; }

  const span = new Span(`HTTP ${req.method} ${req.path}`, {
    traceId, parentSpanId,
    attributes: {
      'http.method': req.method,
      'http.target': req.path,
      'http.user_agent': String(req.headers['user-agent'] || '').slice(0, 100)
    }
  });
  req.span = span;
  req.traceId = span.traceId;
  res.setHeader('X-Trace-Id', span.traceId);

  res.on('finish', () => {
    span.setAttribute('http.status_code', res.statusCode);
    if (res.statusCode >= 500) span.setStatus(2, 'server error');
    else if (res.statusCode >= 400) span.setStatus(2, 'client error');
    else span.setStatus(1);
    span.end();
  });

  next();
}

module.exports = { start, recent, findByTraceId, toOTLP, tracingMiddleware, Span };
