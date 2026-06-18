// Postman collection + README + webhook events docs.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test('Postman: collection gerada e valida JSON', () => {
  execSync('node scripts/generate-sdk.js', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'botdash.postman_collection.json');
  assert(fs.existsSync(f), 'collection existe');
  const col = JSON.parse(fs.readFileSync(f, 'utf8'));
  assertEq(col.info.name, 'BotDash API');
  assert(col.info.schema.includes('postman.com/json/collection/v2.1.0'));
  assert(Array.isArray(col.item), 'item array');
  assert(col.item.length >= 14, 'pelo menos 14 requests (' + col.item.length + ')');
});

test('Postman: cada request tem url + auth header + body bem-formado', () => {
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'botdash.postman_collection.json');
  const col = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const it of col.item) {
    assert(it.request, `${it.name} tem request`);
    assert(it.request.url?.raw?.startsWith('{{base_url}}'), `${it.name} url usa {{base_url}}`);
    const authHeader = it.request.header.find(h => h.key === 'Authorization');
    assert(authHeader, `${it.name} tem Authorization header`);
    assertEq(authHeader.value, 'Bearer {{api_key}}');
    if (it.request.method === 'POST' || it.request.method === 'PUT') {
      assert(it.request.body, `${it.name} tem body`);
      assertEq(it.request.body.mode, 'raw');
    }
  }
});

test('Postman: variables base_url + api_key + api_version', () => {
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'botdash.postman_collection.json');
  const col = JSON.parse(fs.readFileSync(f, 'utf8'));
  const keys = col.variable.map(v => v.key);
  assert(keys.includes('base_url'));
  assert(keys.includes('api_key'));
  assert(keys.includes('api_version'));
});

test('Postman: path variables sao corretamente extraidos de {param}', () => {
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'botdash.postman_collection.json');
  const col = JSON.parse(fs.readFileSync(f, 'utf8'));
  // Find o refund/{sale_id}
  const refund = col.item.find(it => it.name.includes('/api/checkout/wallet/refund/{sale_id}') && it.name.startsWith('POST'));
  assert(refund, 'refund encontrado');
  assert(refund.request.url.path.includes(':sale_id'), ':sale_id como variable');
  const vars = refund.request.url.variable;
  assert(vars.some(v => v.key === 'sale_id'), 'variable sale_id declarada');
});

test('SDK README: existe e cobre 3 linguagens', () => {
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'README.md');
  assert(fs.existsSync(f), 'README.md existe');
  const md = fs.readFileSync(f, 'utf8');
  assert(md.includes('## JavaScript'));
  assert(md.includes('## Python'));
  assert(md.includes('## Postman'));
  assert(md.includes('## CLI'));
  assert(md.includes('## Webhook receiver'));
  assert(md.includes('BotDashClient'));
  assert(md.includes('idempotencyKey') || md.includes('idempotency_key'));
});

test('Webhook events docs: cobre 4 eventos com schemas', () => {
  const f = path.join(__dirname, '..', 'docs', 'webhook-events.md');
  assert(fs.existsSync(f), 'webhook-events.md existe');
  const md = fs.readFileSync(f, 'utf8');
  for (const evt of ['sale.paid', 'sale.refunded', 'sale.med_returned', 'webhook.test']) {
    assert(md.includes('`' + evt + '`'), `${evt} documentado`);
  }
  // Headers documentados
  assert(md.includes('X-BotDash-Signature-V2'));
  assert(md.includes('X-BotDash-Timestamp'));
  assert(md.includes('X-BotDash-Delivery'));
  // Codigo exemplo de verificacao
  assert(md.includes('createHmac'));
  // Retry policy
  assert(md.includes('failure_count') || md.includes('5 falhas'));
});
