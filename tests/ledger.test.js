const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  // Tabelas minimas
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users VALUES (42);
  `);
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '034_ledger_dlq.sql'), 'utf8'));
  return db;
}

const L = require('../src/services/ledger.service');

test('post valida soma=0', () => {
  const db = makeDb();
  let threw = false;
  try {
    L.post(db, 'bad', [
      { account: 'a', direction: 'debit', amount_cents: 100 },
      { account: 'b', direction: 'credit', amount_cents: 99 }
    ]);
  } catch { threw = true; }
  assert(threw, 'deve falhar quando soma nao zera');
});

test('recordSale grava 3 entries que zeram', () => {
  const db = makeDb();
  L.recordSale(db,
    { id: 1, amount_cents: 10000 },
    { seller_id: 42, percent_fee_cents: 790, fixed_fee_cents: 149, net_to_owner_cents: 9061 },
    14
  );
  const total = db.prepare(`SELECT COALESCE(SUM(signed_amount),0) AS v FROM ledger_entries WHERE transaction_id='sale-1'`).get().v;
  assertEq(total, 0, 'sale entries zeram');
  assertEq(L.balance(db, 'user:42:hold'), 9061);
  assertEq(L.balance(db, 'platform:revenue'), 939);
});

test('releaseHold move de hold pra available', () => {
  const db = makeDb();
  L.recordSale(db, { id: 1, amount_cents: 10000 }, { seller_id: 42, percent_fee_cents: 790, fixed_fee_cents: 149, net_to_owner_cents: 9061 }, 14);
  L.releaseHold(db, 42, 9061, 1);
  assertEq(L.balance(db, 'user:42:hold'), 0);
  assertEq(L.balance(db, 'user:42:available'), 9061);
});

test('Fluxo completo: venda + libera + saque ZERA o total', () => {
  const db = makeDb();
  L.recordSale(db, { id: 1, amount_cents: 10000 }, { seller_id: 42, percent_fee_cents: 790, fixed_fee_cents: 149, net_to_owner_cents: 9061 }, 14);
  L.releaseHold(db, 42, 9061, 1);
  L.recordWithdrawal(db, 42, 99, 5000, 50);
  const grandTotal = db.prepare('SELECT COALESCE(SUM(signed_amount),0) AS v FROM ledger_entries').get().v;
  assertEq(grandTotal, 0, 'soma geral do ledger sempre zera');
});
