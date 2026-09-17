import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hasDb, startDb, truncate, stopDb, fakeReq, fakeRes } from './helpers/db.js';

const suite = { skip: !hasDb };
let sql;
let lead;
let event;

before(async () => {
  if (!hasDb) return;
  process.env.IP_SALT = 'test-salt';
  ({ sql } = await startDb());
  lead = (await import('../api/lead.js')).default;
  event = (await import('../api/event.js')).default;
});

beforeEach(async () => {
  if (hasDb) await truncate();
});

after(async () => {
  if (hasDb) await stopDb();
});

const body = {
  session_id: 'sess1234abcd',
  name: 'Sam',
  email: 'sam@example.com',
  phone: '020 7946 0000',
  postcode: 'sw11 3ab',
  job_types: ['New AC installation'],
  property_type: 'House',
  address_line: '12 Kingsley Road',
  town: 'London',
  referrer: 'https://www.google.com/search?q=air+con+installation',
  landing_path: '/',
};

async function post(handler, payload) {
  const res = fakeRes();
  await handler(fakeReq({ body: payload }), res);
  return res;
}

test('a complete lead stores and comes back with an id', suite, async () => {
  const res = await post(lead, body);
  assert.equal(res.statusCode, 200);
  assert.ok(res.payload.id);

  const rows = await sql`SELECT * FROM leads WHERE id = ${res.payload.id}`;
  assert.equal(rows[0].postcode, 'SW11 3AB');
  assert.equal(rows[0].channel, 'organic');
  assert.equal(rows[0].stage, 'complete');
  // The raw address is never stored, only a salted hash of it.
  assert.equal(rows[0].ip_hash.length, 64);
  assert.ok(!String(rows[0].ip_hash).includes('203.0.113.9'));
});

test('a partial then a completion reconcile to one enquiry', suite, async () => {
  await post(lead, { ...body, stage: 'partial', job_types: [], property_type: null });
  await post(lead, body);

  const rows = await sql`SELECT stage FROM leads WHERE session_id = ${body.session_id} ORDER BY stage`;
  assert.deepEqual(rows.map((r) => r.stage), ['complete', 'partial']);

  const counted = await sql`SELECT count(*)::int AS n FROM leads WHERE stage = 'complete'`;
  assert.equal(counted[0].n, 1);
});

test('a partial landing after the completion is dropped', suite, async () => {
  await post(lead, body);
  const late = await post(lead, { ...body, stage: 'partial', address_line: null, town: null });
  assert.equal(late.payload.superseded, true);

  const rows = await sql`SELECT count(*)::int AS n FROM leads WHERE session_id = ${body.session_id}`;
  assert.equal(rows[0].n, 1);

  // And the address the visitor gave is still there.
  const stored = await sql`SELECT address_line FROM leads WHERE stage = 'complete'`;
  assert.equal(stored[0].address_line, '12 Kingsley Road');
});

test('the honeypot returns 200 and writes nothing', suite, async () => {
  const res = await post(lead, { ...body, website: 'http://spam.example' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.id, null);
  const rows = await sql`SELECT count(*)::int AS n FROM leads`;
  assert.equal(rows[0].n, 0);
});

test('field errors come back as a 400 with the markup copy', suite, async () => {
  const res = await post(lead, { ...body, email: 'nope' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.errors.email, 'Please enter a valid email address.');
});

test('the lead throttle stops the ninth enquiry in the window', suite, async () => {
  for (let i = 0; i < 8; i += 1) {
    const res = await post(lead, { ...body, session_id: `sess0000000${i}` });
    assert.equal(res.statusCode, 200, `enquiry ${i + 1} should be allowed`);
  }
  const blocked = await post(lead, { ...body, session_id: 'sess00000009' });
  assert.equal(blocked.statusCode, 429);
});

test('a completed lead back-fills its id onto the visit events', suite, async () => {
  await post(event, { session_id: body.session_id, type: 'page_view', path: '/' });
  await post(event, { session_id: body.session_id, type: 'form_start', detail: { step: 1 } });

  const res = await post(lead, body);
  const rows = await sql`
    SELECT lead_id FROM events WHERE session_id = ${body.session_id}`;
  assert.equal(rows.length, 2);
  for (const row of rows) assert.equal(Number(row.lead_id), Number(res.payload.id));
});

test('an unknown event type is refused', suite, async () => {
  const res = await post(event, { session_id: body.session_id, type: 'made_up' });
  assert.equal(res.statusCode, 400);
});

test('event detail is stripped to the allow-list', suite, async () => {
  await post(event, {
    session_id: body.session_id,
    type: 'field_error',
    detail: { field: 'email', evil: '<script>', step: 2 },
  });
  const rows = await sql`SELECT detail FROM events LIMIT 1`;
  assert.deepEqual(rows[0].detail, { step: 2, field: 'email' });
});

test('a foreign Origin is refused on a write', suite, async () => {
  const res = fakeRes();
  await lead(fakeReq({ body, headers: { origin: 'https://evil.example', host: 'coolright.co.uk' } }), res);
  assert.equal(res.statusCode, 403);
});
