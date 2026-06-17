#!/usr/bin/env node
// BotDash CLI — wrapper sobre o SDK JS pra uso em terminal/scripts.
//
// Setup:
//   export BOTDASH_API_URL=https://SEU-DOMINIO
//   export BOTDASH_API_KEY=bd_a1b2_xxx
//
// Comandos:
//   botdash sales list [--status=paid] [--provider=mp] [--limit=20]
//   botdash sales get <id>
//   botdash refund <sale_id> [--reason="..."] [--value=5000] [--idempotency=<key>]
//   botdash refund bulk <id,id,id> [--reason="..."]
//   botdash dispute <sale_id> [--reason="..."]
//   botdash providers list
//   botdash test-key                 # smoke test da api key
//   botdash sandbox create [--amount=1000] [--provider=mp]
//   botdash sandbox pay <sale_id>    # simula pagamento (so sandbox)
//
// Output: JSON formatado (jq friendly via | jq). Exit code 0=ok, 1=error.

const baseUrl = (process.env.BOTDASH_API_URL || '').replace(/\/+$/, '');
const apiKey  = process.env.BOTDASH_API_KEY;

function die(msg, code = 1) { console.error(msg); process.exit(code); }

if (!baseUrl) die('BOTDASH_API_URL nao definido');
if (!apiKey)  die('BOTDASH_API_KEY nao definido');

const argv = process.argv.slice(2);
const cmd = argv[0];
const sub = argv[1];

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v == null ? true : v;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function request(method, path, { body, query, idempotencyKey } = {}) {
  let url = baseUrl + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([_, v]) => v != null && v !== ''));
    if ([...qs].length) url += '?' + qs.toString();
  }
  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'BotDash-CLI/1.0'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch {}
  if (!r.ok) {
    die(JSON.stringify({
      error: parsed?.error || `HTTP ${r.status}`,
      status: r.status,
      body: parsed || text,
      rate_limit: {
        remaining: r.headers.get('X-RateLimit-Remaining'),
        reset: r.headers.get('X-RateLimit-Reset'),
        retry_after: r.headers.get('Retry-After')
      }
    }, null, 2));
  }
  return parsed;
}

async function main() {
  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(`BotDash CLI

Comandos:
  sales list [--status=] [--provider=] [--limit=N] [--after_id=N]
  sales get <id>
  refund <sale_id> [--reason=] [--value=cents] [--idempotency=]
  refund bulk <id,id,id> [--reason=]
  dispute <sale_id> [--reason=]
  providers list
  test-key
  sandbox create [--amount=1000] [--provider=mercadopago]
  sandbox pay <sale_id>
`);
    return;
  }

  const { flags, positional } = parseFlags(argv.slice(2));

  if (cmd === 'sales') {
    if (sub === 'list') {
      const r = await request('GET', '/api/checkout/wallet/sales', {
        query: { status: flags.status, provider: flags.provider, limit: flags.limit, after_id: flags.after_id }
      });
      console.log(JSON.stringify(r, null, 2));
    } else if (sub === 'get') {
      const id = positional[0];
      if (!id) die('uso: sales get <id>');
      const r = await request('GET', `/api/checkout/wallet/sale/${id}/timeline`);
      console.log(JSON.stringify(r, null, 2));
    }
  } else if (cmd === 'refund') {
    if (sub === 'bulk') {
      const ids = String(positional[0] || '').split(',').map(x => parseInt(x)).filter(Boolean);
      if (!ids.length) die('uso: refund bulk <id,id,id>');
      const r = await request('POST', '/api/checkout/wallet/refund/bulk', {
        body: { sale_ids: ids, reason: flags.reason },
        idempotencyKey: flags.idempotency
      });
      console.log(JSON.stringify(r, null, 2));
    } else {
      const id = sub;
      if (!id) die('uso: refund <sale_id>');
      const r = await request('POST', `/api/checkout/wallet/refund/${id}`, {
        body: { reason: flags.reason, value: flags.value ? parseInt(flags.value) : undefined },
        idempotencyKey: flags.idempotency
      });
      console.log(JSON.stringify(r, null, 2));
    }
  } else if (cmd === 'dispute') {
    const id = sub;
    if (!id) die('uso: dispute <sale_id>');
    const r = await request('POST', `/api/checkout/wallet/sale/${id}/dispute`, {
      body: { reason: flags.reason }
    });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'providers' && sub === 'list') {
    const r = await request('GET', '/api/payment-providers/public');
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'test-key') {
    const r = await request('GET', '/api/checkout/wallet/sales', { query: { limit: 1 } });
    console.log('✓ key valida.', r.sales?.length || 0, 'sale(s) acessiveis.');
  } else if (cmd === 'sandbox') {
    if (sub === 'create') {
      const r = await request('POST', '/api/sandbox/create-sale', {
        body: {
          amount_cents: flags.amount ? parseInt(flags.amount) : 1000,
          provider: flags.provider || 'mercadopago',
          discord_id: flags.discord_id || '000000000000000000'
        }
      });
      console.log(JSON.stringify(r, null, 2));
    } else if (sub === 'pay') {
      const id = positional[0];
      if (!id) die('uso: sandbox pay <sale_id>');
      const r = await request('POST', `/api/sandbox/simulate-payment/${id}`, {
        body: { event: flags.event || 'paid' }
      });
      console.log(JSON.stringify(r, null, 2));
    }
  } else {
    die(`comando desconhecido: ${cmd}. Use --help`);
  }
}

main().catch(e => {
  die(JSON.stringify({ error: e.message, stack: e.stack?.split('\n').slice(0, 4) }, null, 2));
});
