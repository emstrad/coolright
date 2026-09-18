import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hasDb, startDb, stopDb, fakeReq, fakeRes } from './helpers/db.js';
import { readStatement } from '../lib/bank/parse.js';
import { normaliseKey, guessSplit, bestMatch } from '../lib/bank/match.js';

const suite = { skip: !hasDb };
let sql;
let bank;
let admin;
let balance;

before(async () => {
  if (!hasDb) return;
  process.env.SESSION_SECRET = 'test-secret';
  ({ sql } = await startDb());
  bank = await import('../lib/routes/bank.js');
  admin = await import('../lib/routes/admin.js');
  ({ balance } = await import('../lib/bank/balance.js'));
});

beforeEach(async () => {
  if (!hasDb) return;
  await sql`TRUNCATE job_payments, bank_transactions, bank_statements, bank_rules, jobs RESTART IDENTITY CASCADE`;
  await sql`UPDATE job_settings SET partners = ARRAY['Sam','Alex'], lead_fee_to = 'Sam' WHERE id = 1`;
});

after(async () => { if (hasDb) await stopDb(); });

// These run without a database: the parser and the scoring are pure.
test('columns are read by name, and the aliases banks actually use', () => {
  const csv = [
    'Completed Date,Reference,Paid In,Paid Out,Fee,Balance,State,Currency',
    '01/04/2026,DEPOSIT KINGSLEY,1200.00,,0.00,3000.00,COMPLETED,GBP',
    '02/04/2026,TRAVIS PERKINS 1234,,450.50,0.50,2549.00,COMPLETED,GBP',
    '03/04/2026,PENDING THING,100.00,,,2649.00,PENDING,GBP',
    '04/04/2026,EURO PAYMENT,,20.00,,2629.00,COMPLETED,EUR',
  ].join('\n');

  const { rows, skipped } = readStatement(csv);
  assert.equal(rows.length, 2, 'pending and foreign currency lines are skipped');
  assert.equal(skipped, 2);
  assert.equal(rows[0].amount_pence, 120000);
  // The fee is folded in, so the line is the money that actually moved.
  assert.equal(rows[1].amount_pence, -45100);
  assert.equal(rows[0].happened_on, '2026-04-01', 'day first, these are UK exports');
});

test('a description with a comma in it survives the parser', () => {
  const csv = 'Date,Description,Amount\n01/04/2026,"SMITH, J DEPOSIT",1200.00';
  const { rows } = readStatement(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'SMITH, J DEPOSIT');
});

test('fingerprints let overlapping months import twice without doubling up', () => {
  const csv = 'Date,Description,Amount,Balance\n01/04/2026,A PAYMENT,100.00,500.00';
  const a = readStatement(csv).rows[0];
  const b = readStatement(csv).rows[0];
  assert.equal(a.fingerprint, b.fingerprint);
});

test('a rule key ignores the numbers, so one decision teaches both lines', () => {
  assert.equal(normaliseKey('TRAVIS PERKINS 1234'), normaliseKey('TRAVIS PERKINS 5678'));
});

test('a split is guessed only where the line says whose money it is', () => {
  assert.deepEqual(guessSplit('TRANSFER TO SAM', -50000, ['Sam']), { Sam: 1 });
  assert.deepEqual(guessSplit('HMRC VAT RETURN', -100000, ['Sam']), { tax: 1 });
  // A card payment to a shop with a partner's name in it is a shop.
  assert.equal(guessSplit('CARD PAYMENT SAMS DINER', -2400, ['Sam']), null);
  // And a transfer in from someone sharing a first name is a customer.
  assert.equal(guessSplit('FASTER PAYMENT FROM ALEXANDRA JONES', 120000, []), null);
});

test('money in scores against the outstanding amount, not just the price', () => {
  const job = {
    id: 1, customer_name: 'Kingsley', postcode: 'N1 3GZ', price_pence: 480000,
    outstanding: 120000, quoted_on: '2026-03-01',
  };
  const { auto } = bestMatch(
    { amount_pence: 120000, description: 'DEPOSIT KINGSLEY N13GZ', happened_on: '2026-04-01' },
    [job],
  );
  assert.equal(auto?.job_id, 1, 'a deposit should match the job it is a deposit on');
});

test('a close call is a suggestion, never an automatic match', () => {
  const jobs = [
    { id: 1, customer_name: 'Smith', price_pence: 120000, outstanding: 120000 },
    { id: 2, customer_name: 'Smyth', price_pence: 120000, outstanding: 120000 },
  ];
  const { auto, suggestions } = bestMatch(
    { amount_pence: 120000, description: 'PAYMENT RECEIVED', happened_on: '2026-04-01' },
    jobs,
  );
  assert.equal(auto, null, 'a wrong match marks the wrong customer as paid');
  assert.ok(suggestions.length >= 2);
});

// The rest need a database.
async function post(handler, body, query = {}) {
  const res = fakeRes();
  const req = fakeReq({ body });
  req.query = query;
  await handler(req, res);
  return res;
}

async function importCsv(text, filename = 'april.csv') {
  const res = fakeRes();
  const req = fakeReq({ body: undefined });
  req.query = { filename };
  req.body = text;
  // readText takes a string body straight through, the way Vercel hands one on.
  await bank.importStatement(req, res);
  return res;
}

async function assertBalances(label) {
  const b = await balance();
  assert.equal(
    b.allocated + b.difference,
    b.net,
    `${label}: the two sides must agree`,
  );
  return b;
}

test('the full lifecycle, with the identity asserted after every step', suite, async () => {
  const job = await post(admin.saveJob, {
    customer_name: 'Kingsley', price_pence: 480000, quoted_on: '2026-03-01',
    status: 'booked', job_date: '2026-04-10', postcode: 'N1 3GZ',
  });
  const jobId = job.payload.job.id;
  await assertBalances('empty');

  const csv = [
    'Date,Description,Amount,Balance,State,Currency',
    '01/04/2026,DEPOSIT KINGSLEY N13GZ,1200.00,1200.00,COMPLETED,GBP',
    '02/04/2026,TRAVIS PERKINS 1234,-1500.00,-300.00,COMPLETED,GBP',
    '03/04/2026,MYSTERY MONEY,500.00,200.00,COMPLETED,GBP',
  ].join('\n');

  const imported = await importCsv(csv);
  assert.equal(imported.payload.added, 3);
  await assertBalances('after import');

  // The same file again adds nothing.
  const again = await importCsv(csv, 'april-again.csv');
  assert.equal(again.payload.added, 0);

  const lines = await sql`SELECT * FROM bank_transactions ORDER BY happened_on`;
  const deposit = lines.find((l) => l.description.includes('DEPOSIT'));
  const merchant = lines.find((l) => l.description.includes('TRAVIS'));

  // The deposit matched the staged amount automatically and became a payment.
  const payments = await sql`SELECT * FROM job_payments WHERE job_id = ${jobId}`;
  assert.equal(payments.length, 1);
  assert.equal(Number(payments[0].amount_pence), 120000);
  assert.equal(payments[0].paid_on.toISOString().slice(0, 10), '2026-04-01');

  // Assigning the merchant invoice to the job is what makes its margin real.
  await post(bank.updateTransaction, { id: merchant.id, action: 'assign', job_id: jobId, learn: true });
  let b = await assertBalances('after assigning spend');
  assert.equal(b.materials, -150000, 'spend assigned but not yet recorded on the job');

  await post(admin.saveJob, {
    id: jobId, customer_name: 'Kingsley', price_pence: 480000, status: 'completed',
    completed_on: '2026-04-11', costs_pence: 150000, quoted_on: '2026-03-01',
  });
  b = await assertBalances('after completing the job');
  assert.equal(b.materials, 0, 'the recorded cost now equals what left the bank');

  // Unmatching removes exactly what matching created.
  await post(bank.updateTransaction, { id: deposit.id, action: 'unmatch' });
  assert.equal((await sql`SELECT * FROM job_payments WHERE job_id = ${jobId}`).length, 0);
  await assertBalances('after unmatching');

  // A split is the other thing a line can be, and never both.
  await post(bank.updateTransaction, { id: deposit.id, action: 'split', split: { Sam: 1, Alex: 1 } });
  const [afterSplit] = await sql`SELECT job_id, split FROM bank_transactions WHERE id = ${deposit.id}`;
  assert.equal(afterSplit.job_id, null);
  await assertBalances('after splitting');

  // Removing the upload removes the payments it created.
  const [statement] = await sql`SELECT id FROM bank_statements ORDER BY id LIMIT 1`;
  await post(bank.removeStatement, { id: statement.id });
  assert.equal((await sql`SELECT * FROM bank_transactions`).length, 0);
  await assertBalances('after removing the statement');
});

test('an odd split still adds back to the line it came from', suite, async () => {
  await importCsv([
    'Date,Description,Amount,Balance,State,Currency',
    '01/04/2026,ODD AMOUNT,10.01,10.01,COMPLETED,GBP',
  ].join('\n'));

  const [line] = await sql`SELECT * FROM bank_transactions`;
  await post(bank.updateTransaction, { id: line.id, action: 'split', split: { Sam: 1, Alex: 1, tax: 1 } });

  const b = await assertBalances('odd split');
  const shared = Object.values(b.people).reduce((a, c) => a + c, 0) + b.taxPot;
  assert.equal(shared, 1001, 'every penny of the line is allocated');
});
