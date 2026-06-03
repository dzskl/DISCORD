// Test runner minimalista — sem dependencias externas.
// Roda todos os arquivos *.test.js da pasta tests/ e imprime resumo.

const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_FILE = path.join(__dirname, '..', '.tmp-test.sqlite');
process.env.DB_PATH = process.env.DATABASE_FILE;
try { fs.unlinkSync(process.env.DB_PATH); } catch {}
try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch {}
try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch {}

let pass = 0, fail = 0;
const failures = [];

global.test = function (name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { pass++; console.log(`  ✓ ${name}`); })
        .catch(e => { fail++; failures.push({ name, err: e }); console.log(`  ✗ ${name} — ${e.message}`); });
    }
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, err: e });
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};

global.assert = function (cond, msg) {
  if (!cond) throw new Error(msg || 'assert falhou');
};

global.assertEq = function (a, b, msg) {
  if (a !== b) throw new Error(msg || `esperado ${JSON.stringify(b)}, recebido ${JSON.stringify(a)}`);
};

async function run() {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
  for (const f of files) {
    console.log(`\n${f}`);
    const ret = require(path.join(__dirname, f));
    if (ret && typeof ret.then === 'function') await ret;
  }
  console.log(`\n${pass} passou, ${fail} falhou`);
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch {}
  process.exit(fail > 0 ? 1 : 0);
}

run();
