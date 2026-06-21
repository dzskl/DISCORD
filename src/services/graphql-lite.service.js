// GraphQL-lite: subset de GraphQL sem dep externa. Suporta queries simples
// (sem mutations, fragments ou variables complexas) pros dados de leitura
// da Wallet. Suficiente pra dashboards e integracoes read-only.
//
// Schema suportado:
//   query {
//     sales(status: "paid", limit: 10) { id amount_cents provider status }
//     sale(id: 123) { id status timeline { type label at } }
//     providers { id label method configured }
//     stats { gmv_30d_cents active_sellers }
//   }
//
// Parser minimo: campos + args planos. Sem aninhamento profundo alem do
// que os resolvers declaram.

const { db } = require('../database/connection');

// ---- Parser ----
// Tokeniza a query num AST simples: { name, args, fields: [...] }
function parseSelection(str, pos) {
  const fields = [];
  while (pos < str.length) {
    skipWs(str, pos); pos = skipWsIdx(str, pos);
    if (str[pos] === '}') { pos++; break; }
    // nome do campo
    const nameMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(str.slice(pos));
    if (!nameMatch) { pos++; continue; }
    const name = nameMatch[0];
    pos += name.length;
    pos = skipWsIdx(str, pos);

    // args opcionais (...)
    let args = {};
    if (str[pos] === '(') {
      const close = str.indexOf(')', pos);
      const argStr = str.slice(pos + 1, close);
      args = parseArgs(argStr);
      pos = close + 1;
    }
    pos = skipWsIdx(str, pos);

    // sub-selection opcional {...}
    let sub = [];
    if (str[pos] === '{') {
      const r = parseSelection(str, pos + 1);
      sub = r.fields;
      pos = r.pos;
    }
    fields.push({ name, args, fields: sub });
  }
  return { fields, pos };
}

function parseArgs(s) {
  const args = {};
  // matches key: "value" | key: 123 | key: true
  const rx = /([a-zA-Z_]\w*)\s*:\s*(?:"([^"]*)"|(\d+)|(true|false))/g;
  let m;
  while ((m = rx.exec(s)) !== null) {
    if (m[2] !== undefined) args[m[1]] = m[2];
    else if (m[3] !== undefined) args[m[1]] = parseInt(m[3]);
    else if (m[4] !== undefined) args[m[1]] = m[4] === 'true';
  }
  return args;
}

function skipWs() {}
function skipWsIdx(s, i) { while (i < s.length && /\s/.test(s[i])) i++; return i; }

function parse(query) {
  // Remove 'query {' wrapper se presente
  let q = query.trim();
  q = q.replace(/^query\s*(\w+\s*)?/, '').trim();
  if (q[0] === '{') {
    const r = parseSelection(q, 1);
    return r.fields;
  }
  const r = parseSelection('{' + q + '}', 1);
  return r.fields;
}

// ---- Resolvers ----
function pick(obj, fields) {
  if (!fields.length) return obj;
  const out = {};
  for (const f of fields) {
    if (f.fields.length && obj[f.name] && typeof obj[f.name] === 'object') {
      out[f.name] = Array.isArray(obj[f.name])
        ? obj[f.name].map(x => pick(x, f.fields))
        : pick(obj[f.name], f.fields);
    } else {
      out[f.name] = obj[f.name];
    }
  }
  return out;
}

// Schema introspection (subset) — descreve os tipos disponiveis pra que
// ferramentas/clientes auto-documentem. Nao eh GraphQL spec completo, mas
// suficiente pra discovery.
const SCHEMA = {
  queries: {
    sales: {
      args: { status: 'String', provider: 'String', limit: 'Int' },
      returns: '[Sale]',
      fields: ['id', 'discord_id', 'discord_tag', 'amount_cents', 'net_to_owner_cents', 'status', 'provider', 'provider_charge_id', 'paid_at', 'created_at', 'guild_id']
    },
    sale: {
      args: { id: 'Int!' },
      returns: 'Sale',
      fields: ['id', 'status', 'provider', 'amount_cents', 'timeline']
    },
    providers: {
      args: {},
      returns: '[Provider]',
      fields: ['id', 'label', 'method', 'country', 'configured']
    },
    stats: {
      args: {},
      returns: 'Stats',
      fields: ['gmv_30d_cents', 'active_sellers']
    }
  }
};

const resolvers = {
  __schema(args, fields) {
    // Retorna a descricao do schema
    return SCHEMA;
  },

  sales(args, fields, ctx) {
    const wheres = ['provider IS NOT NULL'];
    const a = [];
    if (ctx.guildId) {
      if (ctx.guildScoped) { wheres.push('guild_id = ?'); a.push(ctx.guildId); }
      else { wheres.push('(guild_id = ? OR guild_id IS NULL)'); a.push(ctx.guildId); }
    }
    if (args.status)   { wheres.push('status = ?'); a.push(args.status); }
    if (args.provider) { wheres.push('provider = ?'); a.push(args.provider); }
    const limit = Math.min(100, args.limit || 50);
    const rows = db.prepare(`
      SELECT id, discord_id, discord_tag, amount_cents, net_to_owner_cents,
             status, provider, provider_charge_id, paid_at, created_at, guild_id
      FROM sales WHERE ${wheres.join(' AND ')}
      ORDER BY id DESC LIMIT ?
    `).all(...a, limit);
    return rows.map(r => pick(r, fields));
  },

  sale(args, fields, ctx) {
    const sale = db.prepare(`SELECT * FROM sales WHERE id=?`).get(args.id);
    if (!sale) return null;
    if (ctx.guildScoped && sale.guild_id !== ctx.guildId) return null;
    // Resolve timeline se pedido
    const timelineField = fields.find(f => f.name === 'timeline');
    if (timelineField) {
      sale.timeline = buildTimeline(sale);
    }
    return pick(sale, fields);
  },

  providers(args, fields) {
    const wallet = require('../config/wallet-providers');
    const registry = require('../providers/wallet');
    return wallet.listProviders().map(p => pick({
      id: p.id, label: p.label, method: p.method, country: p.country,
      configured: registry.isSupported(p.id) && registry.isConfigured(p.id)
    }, fields));
  },

  stats(args, fields, ctx) {
    const now = Math.floor(Date.now() / 1000);
    const d30 = now - 30 * 86400;
    const gFilter = ctx.guildId ? 'AND (guild_id = ? OR guild_id IS NULL)' : '';
    const gArgs = ctx.guildId ? [ctx.guildId] : [];
    const gmv = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status='paid' AND paid_at >= ? ${gFilter}`).get(d30, ...gArgs).v;
    const sellers = db.prepare(`SELECT COUNT(DISTINCT COALESCE(guild_id,'_')) AS c FROM sales WHERE status='paid' AND paid_at >= ?`).get(d30).c;
    return pick({ gmv_30d_cents: gmv, active_sellers: sellers }, fields);
  }
};

function buildTimeline(sale) {
  const events = [];
  events.push({ type: 'created', label: 'Cobranca criada', at: sale.created_at });
  if (sale.paid_at) events.push({ type: 'paid', label: 'Pagamento confirmado', at: sale.paid_at });
  if (sale.status === 'refunded') events.push({ type: 'refunded', label: 'Reembolso', at: sale.paid_at });
  if (sale.status === 'med_returned') events.push({ type: 'med', label: 'MED', at: sale.paid_at });
  return events;
}

function execute(query, ctx = {}) {
  const fields = parse(query);
  const data = {};
  const errors = [];
  for (const f of fields) {
    const resolver = resolvers[f.name];
    if (!resolver) {
      errors.push({ message: `campo desconhecido: ${f.name}` });
      continue;
    }
    try {
      data[f.name] = resolver(f.args, f.fields, ctx);
    } catch (e) {
      errors.push({ message: e.message, path: [f.name] });
    }
  }
  return errors.length ? { data, errors } : { data };
}

module.exports = { execute, parse, resolvers, SCHEMA };
