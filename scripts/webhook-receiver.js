#!/usr/bin/env node
// Webhook receiver simulator pra DEV: roda um servidor local que recebe
// outbound webhooks do BotDash e mostra o payload + valida HMAC.
//
// Uso:
//   node scripts/webhook-receiver.js <secret> [--port=4001]
//
// Aponte o webhook do BotDash pra http://localhost:4001/ (ngrok pra publico).

const http = require('http');
const crypto = require('crypto');

const secret = process.argv[2];
if (!secret) {
  console.error('Uso: node scripts/webhook-receiver.js <secret> [--port=4001]');
  process.exit(1);
}
const portArg = process.argv.find(a => a.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1]) : 4001;

const seen = new Set();      // dedup via delivery uuid

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); return res.end('method not allowed'); }

  let chunks = '';
  req.on('data', c => chunks += c);
  req.on('end', () => {
    const sigV1 = req.headers['x-botdash-signature'];
    const sigV2 = req.headers['x-botdash-signature-v2'];
    const ts    = req.headers['x-botdash-timestamp'];
    const delivery = req.headers['x-botdash-delivery'];
    const event = req.headers['x-botdash-event'];

    // Verifica HMAC v2 se disponivel (mais seguro)
    let validV2 = null;
    if (sigV2 && ts) {
      const expected = 't=' + ts + ',v2=' + crypto.createHmac('sha256', secret).update(ts + '.' + chunks).digest('hex');
      validV2 = sigV2 === expected;
    }
    let validV1 = null;
    if (sigV1) {
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(chunks).digest('hex');
      validV1 = sigV1 === expected;
    }

    // Dedup por delivery
    const isDup = delivery && seen.has(delivery);
    if (delivery) seen.add(delivery);

    let payload = null; try { payload = JSON.parse(chunks); } catch {}

    console.log('\n[' + new Date().toISOString() + '] ' + event);
    console.log('  delivery:', delivery);
    console.log('  HMAC v1:', validV1 === true ? '✓' : validV1 === false ? '✗' : '(absent)');
    console.log('  HMAC v2:', validV2 === true ? '✓' : validV2 === false ? '✗' : '(absent)');
    console.log('  Dup:', isDup ? '⚠ duplicate' : 'first');
    if (payload?.data) console.log('  data:', JSON.stringify(payload.data, null, 2).split('\n').join('\n  '));

    // Sempre responde 200 (sucesso) pra BotDash nao retentar
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hmac_v2_valid: validV2, dup: isDup }));
  });
});

server.listen(port, () => {
  console.log(`Webhook receiver escutando em http://localhost:${port}`);
  console.log(`Secret carregado (${secret.length} chars)`);
  console.log(`\nAponte o webhook do BotDash pra essa URL.`);
  console.log(`Pra expor publicamente: ngrok http ${port}`);
});
