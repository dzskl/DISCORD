// SDK Python + CLI + webhook receiver.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test('SDK Python: arquivo existe e parseavel', () => {
  // Roda generator pra garantir output atualizado
  execSync('node scripts/generate-sdk.js', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  const f = path.join(__dirname, '..', 'docs', 'sdk', 'botdash.py');
  assert(fs.existsSync(f), 'botdash.py existe');
  // python3 -c "import ast; ast.parse(open(...).read())" valida sintaxe
  try {
    execSync(`python3 -c "import ast; ast.parse(open('${f}').read())"`, { stdio: 'pipe' });
  } catch (e) {
    throw new Error('Python SDK invalido: ' + e.message);
  }
});

test('SDK Python: contem BotDashClient + BotDashError + metodos camelcase', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'docs', 'sdk', 'botdash.py'), 'utf8');
  assert(content.includes('class BotDashClient'));
  assert(content.includes('class BotDashError'));
  // urllib usado (sem deps externas)
  assert(content.includes('urllib.request'));
  // Pelo menos um endpoint convertido pra snake_case
  assert(content.includes('def list_'), 'metodos snake_case presentes');
  // BotDash-Version e Idempotency-Key suportados
  assert(content.includes('BotDash-Version'));
  assert(content.includes('Idempotency-Key'));
});

test('SDK Python: BotDashError captura status + rate_limit', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'docs', 'sdk', 'botdash.py'), 'utf8');
  assert(content.includes('rate_limit'));
  assert(content.includes('X-RateLimit-Limit'));
  assert(content.includes('Retry-After'));
});

test('CLI: --help imprime comandos', () => {
  const out = execSync('node scripts/botdash-cli.js --help', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    env: { ...process.env, BOTDASH_API_URL: 'http://x', BOTDASH_API_KEY: 'bd_test' }
  }).toString();
  assert(out.includes('sales list'), 'comando sales list listado');
  assert(out.includes('refund'));
  assert(out.includes('dispute'));
  assert(out.includes('sandbox'));
});

test('CLI: erro sem BOTDASH_API_URL', () => {
  let threw = false;
  try {
    execSync('node scripts/botdash-cli.js sales list', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, BOTDASH_API_URL: '', BOTDASH_API_KEY: 'bd_x' }
    });
  } catch (e) {
    threw = true;
    assert(String(e.stderr).includes('BOTDASH_API_URL'));
  }
  assert(threw);
});

test('Webhook receiver: arquivo valido + parseavel', () => {
  const f = path.join(__dirname, '..', 'scripts', 'webhook-receiver.js');
  assert(fs.existsSync(f));
  execSync(`node --check ${f}`, { stdio: 'pipe' });
  const content = fs.readFileSync(f, 'utf8');
  assert(/x-botdash-signature-v2/i.test(content), 'valida HMAC v2');
  assert(content.includes('crypto.createHmac'));
});

test('package.json: novos scripts (sdk:generate, cli, webhook:receive)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert(pkg.scripts['sdk:generate']);
  assert(pkg.scripts['cli']);
  assert(pkg.scripts['webhook:receive']);
});
