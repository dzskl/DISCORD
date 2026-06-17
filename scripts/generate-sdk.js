#!/usr/bin/env node
// Gera client JS minimalista a partir do OpenAPI. Sem deps externas: parsing
// YAML feito a mao pros padroes que usamos.
//
// Output: docs/sdk/botdash-js.js — single-file ES module pronto pra <script>
// ou import.
//
// Uso: node scripts/generate-sdk.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'docs', 'openapi.yaml');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'sdk');
const OUT_JS = path.join(OUT_DIR, 'botdash-js.js');

function camel(s) {
  return s.replace(/[\/{}]/g, ' ')
    .trim()
    .split(/[\s_-]+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

function methodName(method, path) {
  const verb = method.toLowerCase();
  const action = verb === 'get' ? (path.endsWith('}') || /\{\w+\}/.test(path) ? 'get' : 'list')
                : verb === 'post' ? 'create'
                : verb === 'put' ? 'update'
                : verb === 'delete' ? 'remove' : verb;
  const resource = path
    .replace(/^\/api\//, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\/+/g, '-')
    .replace(/[-]+$/, '')
    .replace(/^[-]+/, '');
  return camel(action + '-' + resource);
}

function parseOpenAPI(yamlText) {
  // Mini parser pra estrutura paths: → /endpoint: → method: → summary
  // Suficiente pro nosso shape unico de openapi.yaml.
  const paths = {};
  const lines = yamlText.split('\n');
  let inPaths = false;
  let currentPath = null;
  let currentMethod = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^paths:/)) { inPaths = true; continue; }
    if (!inPaths) continue;
    // novo path (2 espacos de indent)
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      paths[currentPath] = {};
      currentMethod = null;
      continue;
    }
    // metodo (4 espacos)
    const methodMatch = line.match(/^    (get|post|put|delete|patch):\s*$/);
    if (methodMatch && currentPath) {
      currentMethod = methodMatch[1];
      paths[currentPath][currentMethod] = { summary: '', tags: [] };
      continue;
    }
    // summary
    const summMatch = line.match(/^      summary:\s*['"]?(.+?)['"]?\s*$/);
    if (summMatch && currentMethod) {
      paths[currentPath][currentMethod].summary = summMatch[1];
      continue;
    }
    const tagsMatch = line.match(/^      tags:\s*\[(.+)\]/);
    if (tagsMatch && currentMethod) {
      paths[currentPath][currentMethod].tags = tagsMatch[1].split(',').map(t => t.trim());
      continue;
    }
  }
  return paths;
}

function generate() {
  const yaml = fs.readFileSync(SRC, 'utf8');
  const paths = parseOpenAPI(yaml);

  const out = [];
  out.push(`// BotDash JS SDK (auto-gerado por scripts/generate-sdk.js)`);
  out.push(`// NAO edite — re-rode o script.`);
  out.push(``);
  out.push(`export class BotDashClient {`);
  out.push(`  constructor({ baseUrl, apiKey, version }) {`);
  out.push(`    if (!baseUrl) throw new Error('baseUrl obrigatorio');`);
  out.push(`    if (!apiKey)  throw new Error('apiKey obrigatorio');`);
  out.push(`    this.baseUrl = baseUrl.replace(/\\/+$/, '');`);
  out.push(`    this.apiKey = apiKey;`);
  out.push(`    this.version = version || null;`);
  out.push(`  }`);
  out.push(``);
  out.push(`  async _request(method, path, { body, idempotencyKey, query } = {}) {`);
  out.push(`    let url = this.baseUrl + path;`);
  out.push(`    if (query) {`);
  out.push(`      const qs = new URLSearchParams(Object.entries(query).filter(([_, v]) => v != null));`);
  out.push(`      if ([...qs].length) url += '?' + qs.toString();`);
  out.push(`    }`);
  out.push(`    const headers = {`);
  out.push(`      'Authorization': 'Bearer ' + this.apiKey,`);
  out.push(`      'Content-Type': 'application/json',`);
  out.push(`      'User-Agent': 'BotDash-SDK-JS/1.0'`);
  out.push(`    };`);
  out.push(`    if (this.version) headers['BotDash-Version'] = this.version;`);
  out.push(`    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;`);
  out.push(`    const res = await fetch(url, {`);
  out.push(`      method, headers,`);
  out.push(`      body: body ? JSON.stringify(body) : undefined`);
  out.push(`    });`);
  out.push(`    const text = await res.text();`);
  out.push(`    let parsed = null; try { parsed = JSON.parse(text); } catch {}`);
  out.push(`    if (!res.ok) {`);
  out.push(`      const err = new Error((parsed && parsed.error) || ('HTTP ' + res.status));`);
  out.push(`      err.status = res.status;`);
  out.push(`      err.body = parsed || text;`);
  out.push(`      err.rateLimit = {`);
  out.push(`        limit:     res.headers.get('X-RateLimit-Limit'),`);
  out.push(`        remaining: res.headers.get('X-RateLimit-Remaining'),`);
  out.push(`        reset:     res.headers.get('X-RateLimit-Reset'),`);
  out.push(`        retryAfter:res.headers.get('Retry-After')`);
  out.push(`      };`);
  out.push(`      throw err;`);
  out.push(`    }`);
  out.push(`    return parsed;`);
  out.push(`  }`);

  // Gera 1 metodo por endpoint
  const seen = new Set();
  for (const [p, methods] of Object.entries(paths)) {
    for (const [method, info] of Object.entries(methods)) {
      let name = methodName(method, p);
      let n = 1;
      while (seen.has(name)) { n++; name = methodName(method, p) + n; }
      seen.add(name);

      // Identifica params em path
      const pathParams = [...p.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      const args = pathParams.slice();
      if (method === 'post' || method === 'put') args.push('body');
      args.push('opts = {}');

      out.push(``);
      out.push(`  // ${method.toUpperCase()} ${p}${info.summary ? ' — ' + info.summary : ''}`);
      out.push(`  async ${name}(${args.join(', ')}) {`);
      let pathBuild = `'${p}'`;
      for (const param of pathParams) {
        pathBuild = pathBuild.replace(`{${param}}`, "' + encodeURIComponent(" + param + ") + '");
      }
      // Cleanup: 'foo' + '...' + '' -> 'foo' + ...
      out.push(`    const path = ${pathBuild};`);
      if (method === 'get' || method === 'delete') {
        out.push(`    return this._request('${method.toUpperCase()}', path, { query: opts.query, idempotencyKey: opts.idempotencyKey });`);
      } else {
        out.push(`    return this._request('${method.toUpperCase()}', path, {`);
        out.push(`      body, idempotencyKey: opts.idempotencyKey, query: opts.query`);
        out.push(`    });`);
      }
      out.push(`  }`);
    }
  }

  out.push(`}`);
  out.push(``);
  out.push(`// Exemplo:`);
  out.push(`//   import { BotDashClient } from './botdash-js.js';`);
  out.push(`//   const bd = new BotDashClient({ baseUrl: 'https://SEU-DOMINIO', apiKey: 'bd_...' });`);
  out.push(`//   const { sales } = await bd.listCheckoutWalletSales({ query: { limit: 10 } });`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JS, out.join('\n') + '\n');
  console.log('SDK gerado em ' + OUT_JS);
  console.log('Endpoints: ' + Array.from(seen).length);
}

if (require.main === module) generate();

module.exports = { generate, methodName, parseOpenAPI };
