#!/usr/bin/env node
// Load test minimalista (sem deps). Dispara N requests concorrentes contra
// um endpoint e reporta latencia (p50/p95/p99), throughput, status codes e
// rate-limit hits. Util pra validar rate limits + capacidade.
//
// Uso:
//   node scripts/load-test.js <url> [--method=GET] [--n=1000] [--concurrency=50]
//                                   [--bearer=bd_xxx] [--body='{...}']
//
// Exemplo:
//   node scripts/load-test.js https://app.botdash.com/api/checkout/wallet/sales \
//     --bearer=bd_a1b2_xxx --n=500 --concurrency=20

const url = process.argv[2];
if (!url) {
  console.error('Uso: node scripts/load-test.js <url> [--n=1000] [--concurrency=50] [--bearer=] [--method=] [--body=]');
  process.exit(1);
}

const flags = {};
for (const a of process.argv.slice(3)) {
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v ?? true; }
}
const N = parseInt(flags.n) || 1000;
const CONCURRENCY = parseInt(flags.concurrency) || 50;
const METHOD = (flags.method || 'GET').toUpperCase();

const headers = { 'User-Agent': 'BotDash-LoadTest/1.0' };
if (flags.bearer) headers['Authorization'] = 'Bearer ' + flags.bearer;
if (flags.body) headers['Content-Type'] = 'application/json';

const latencies = [];
const statusCounts = {};
let rateLimited = 0;
let errors = 0;
let done = 0;

async function oneRequest() {
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(url, { method: METHOD, headers, body: flags.body || undefined });
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    latencies.push(ms);
    statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
    if (res.status === 429) rateLimited++;
    await res.text();   // drena o body
  } catch (e) {
    errors++;
  }
  done++;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function run() {
  console.log(`Load test: ${METHOD} ${url}`);
  console.log(`requests=${N} concurrency=${CONCURRENCY}\n`);
  const startWall = Date.now();

  let launched = 0;
  async function worker() {
    while (launched < N) {
      launched++;
      await oneRequest();
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const elapsedS = (Date.now() - startWall) / 1000;
  const throughput = (done / elapsedS).toFixed(1);

  console.log('=== Resultados ===');
  console.log(`tempo total:    ${elapsedS.toFixed(2)}s`);
  console.log(`throughput:     ${throughput} req/s`);
  console.log(`latencia p50:   ${pct(latencies, 0.50).toFixed(1)}ms`);
  console.log(`latencia p95:   ${pct(latencies, 0.95).toFixed(1)}ms`);
  console.log(`latencia p99:   ${pct(latencies, 0.99).toFixed(1)}ms`);
  console.log(`latencia max:   ${Math.max(0, ...latencies).toFixed(1)}ms`);
  console.log(`rate limited:   ${rateLimited} (429)`);
  console.log(`erros conexao:  ${errors}`);
  console.log(`status codes:`, statusCounts);
}

run().catch(e => { console.error(e); process.exit(1); });
