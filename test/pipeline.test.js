import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hasDb, startDb, stopDb, fakeReq, fakeRes } from './helpers/db.js';

const suite = { skip: !hasDb };
let sql;
let admin;

before(async () => {
  if (!hasDb) return;
  process.env.IP_SALT = 'test-salt';
  process.env.SESSION_SECRET = 'test-secret';
  ({ sql } = await startDb());
  admin = await import('../lib/routes/admin.js');
});

beforeEach(async () => {
  if (!hasDb) return;
  await sql`TRUNCATE job_payments, bank_transactions, bank_statements, bank_rules, jobs RESTART IDENTITY CASCADE`;
  await sql`UPDATE job_settings SET partners = ARRAY['Sam','Alex'], lead_fee_to = 'Sam',
              tax_percent = 20, lead_fee_percent = 15 WHERE id = 1`;
});

after(async () => { if (hasDb) await stopDb(); });

async function post(handler, body, query = {}) {
  const res = fakeRes();
  const req = fakeReq({ body });
  req.query = query;
  await handler(req, res);
  return res;
}

async function get(handler, query = {}) {
  const res = fakeRes();
  const req = fakeReq({ method: 'GET' });
  req.query = query;
  await handler(req, res);
  return res;
}

const quote = (over = {}) => ({
  customer_name: 'A Customer',
  price_pence: 400000,
  quoted_on: '2026-04-01',
  job_type: null,
  ...over,
});

test('a quote can be raised, won, and counted', suite, async () => {
  const raised = await post(admin.saveJob, quote());
  assert.equal(raised.statusCode, 200);
  assert.equal(raised.payload.job.status, 'quoted');

  await post(admin.saveJob, quote({ id: raised.payload.job.id, status: 'booked', job_date: '2026-04-20' }));

  const { conversion } = await import('../lib/pipeline.js');
  const rate = await conversion(null);
  assert.equal(rate.sent, 1);
  assert.equal(rate.won, 1);
  assert.equal(rate.rate, 100);
});

test('a declined quote leaves the rate right and the earnings untouched', suite, async () => {
  const won = await post(admin.saveJob, quote());
  await post(admin.saveJob, quote({ id: won.payload.job.id, status: 'completed', completed_on: '2026-04-21' }));
  const lost = await post(admin.saveJob, quote({ customer_name: 'B Customer' }));
  await post(admin.saveJob, quote({
    id: lost.payload.job.id, customer_name: 'B Customer', status: 'declined', declined_reason: 'price',
  }));

  const { conversion, earningsTotals } = await import('../lib/pipeline.js');
  const rate = await conversion(null);
  assert.equal(rate.sent, 2);
  assert.equal(rate.won, 1);
  assert.equal(rate.lost, 1);
  assert.equal(rate.rate, 50);

  // Only the completed job pays anybody.
  const totals = await earningsTotals(null);
  assert.equal(totals.jobs, 1);
  assert.equal(totals.price, 400000);
});

test('a quote declined without a reason is refused', suite, async () => {
  const raised = await post(admin.saveJob, quote());
  const res = await post(admin.saveJob, quote({ id: raised.payload.job.id, status: 'declined' }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.errors.declined_reason, 'Why was it lost?');
});

test('an open quote is not counted as a loss', suite, async () => {
  await post(admin.saveJob, quote());
  const { conversion } = await import('../lib/pipeline.js');
  const rate = await conversion(null);
  assert.equal(rate.open, 1);
  // Nothing has been decided, so there is no rate to report yet.
  assert.equal(rate.rate, null);
});

test('a job keeps the rates it was agreed at when the settings change', suite, async () => {
  const raised = await post(admin.saveJob, quote());
  await sql`UPDATE job_settings SET lead_fee_percent = 40 WHERE id = 1`;

  await post(admin.saveJob, quote({ id: raised.payload.job.id, price_pence: 400000, status: 'booked' }));
  const [row] = await sql`SELECT lead_fee_percent FROM jobs WHERE id = ${raised.payload.job.id}`;
  assert.equal(Number(row.lead_fee_percent), 15, 'editing must not rewrite what was already agreed');

  const fresh = await post(admin.saveJob, quote({ customer_name: 'C Customer' }));
  const [newRow] = await sql`SELECT lead_fee_percent FROM jobs WHERE id = ${fresh.payload.job.id}`;
  assert.equal(Number(newRow.lead_fee_percent), 40, 'a new job takes today rates');
});

test('three staged payments reach paid in full exactly, and owed work surfaces', suite, async () => {
  const raised = await post(admin.saveJob, quote());
  const id = raised.payload.job.id;
  await post(admin.saveJob, quote({ id, status: 'completed', completed_on: '2026-04-21' }));

  const { owed } = await import('../lib/pipeline.js');
  assert.equal((await owed()).length, 1, 'finished work with nothing paid must show');

  await post(admin.payments, { job_id: id, amount_pence: 120000, paid_on: '2026-04-02', label: 'deposit' });
  await post(admin.payments, { job_id: id, amount_pence: 180000, paid_on: '2026-04-18', label: 'stage' });
  const last = await post(admin.payments, { job_id: id, amount_pence: 100000, paid_on: '2026-04-25', label: 'balance' });

  assert.equal(last.payload.payment.received, 400000);
  assert.equal(last.payload.payment.outstanding, 0);
  assert.equal(last.payload.payment.paidInFull, true);
  assert.equal((await owed()).length, 0);
});

test('a client card carries the lead details without anyone retyping them', suite, async () => {
  const [lead] = await sql`
    INSERT INTO leads (session_id, stage, name, email, postcode, address_line, town, files, channel)
    VALUES ('sess-client-1', 'complete', 'Pat', 'pat@example.com', 'N1 3GZ', '4 Kingsley Road',
            'London', ARRAY['leads/sess-client-1/photo.jpg'], 'organic')
    RETURNING id`;

  const raised = await post(admin.saveJob, quote({ lead_id: lead.id, customer_name: 'Pat', status: 'booked', job_date: '2099-01-01' }));
  assert.ok(raised.payload.job.id);

  const res = await get(admin.clients);
  const card = res.payload.clients[0];
  assert.equal(card.customer_name, 'Pat');
  assert.deepEqual(card.files, ['leads/sess-client-1/photo.jpg']);
  assert.equal(card.channel, 'organic');
  assert.equal(card.archived, false, 'a future job date is not archived');
});
