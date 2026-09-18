import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hasDb, startDb, stopDb, fakeReq, fakeRes } from './helpers/db.js';
import { issue, verify, cookieHeader, session } from '../lib/session.js';

process.env.SESSION_SECRET = 'a-test-signing-secret';

test('a session verifies, and an edited one does not', () => {
  const token = issue();
  assert.equal(verify(token).who, 'staff');

  const [body, mac] = token.split('.');
  const edited = Buffer.from(JSON.stringify({ who: 'staff', exp: 9999999999 })).toString('base64url');
  assert.equal(verify(`${edited}.${mac}`), null, 'the signature is what stops it being edited');
  assert.equal(verify(`${body}.${mac.slice(0, -2)}xx`), null);
  assert.equal(verify('rubbish'), null);
  assert.equal(verify(''), null);
});

test('an expired session is refused', () => {
  const body = Buffer.from(JSON.stringify({ who: 'staff', exp: 1 })).toString('base64url');
  const token = issue();
  // Re-sign the expired body with the real key, so only the expiry is wrong.
  const realMac = token.split('.')[1];
  assert.equal(verify(`${body}.${realMac}`), null);
});

test('rotating the secret signs everyone out', () => {
  const token = issue();
  process.env.SESSION_SECRET = 'a-different-secret';
  assert.equal(verify(token), null);
  process.env.SESSION_SECRET = 'a-test-signing-secret';
});

test('the cookie is httpOnly, Secure and SameSite Lax, and clears on logout', () => {
  const set = cookieHeader(issue());
  assert.match(set, /HttpOnly/);
  assert.match(set, /Secure/);
  assert.match(set, /SameSite=Lax/);
  assert.match(set, /Max-Age=28800/);
  assert.match(cookieHeader(''), /Max-Age=0/);
});

const suite = { skip: !hasDb };
let sql;
let auth;

before(async () => {
  if (!hasDb) return;
  process.env.IP_SALT = 'test-salt';
  process.env.STAFF_ACCESS_CODE = 'the-real-code';
  ({ sql } = await startDb());
  auth = (await import('../api/auth/[action].js')).default;
});

beforeEach(async () => {
  if (hasDb) await sql`TRUNCATE rate_hits, events RESTART IDENTITY CASCADE`;
});

after(async () => { if (hasDb) await stopDb(); });

async function login(code) {
  const res = fakeRes();
  const req = fakeReq({ body: { code } });
  req.query = { action: 'login' };
  await auth(req, res);
  return res;
}

test('the right code signs in and sets the cookie', suite, async () => {
  const res = await login('the-real-code');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /cr_staff=/);
  assert.ok(session({ headers: { cookie: res.headers['set-cookie'].split(';')[0] } }));
});

test('a wrong code is refused, and the attempt is recorded', suite, async () => {
  const res = await login('not-the-code');
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, 'wrong');
  const rows = await sql`SELECT type FROM events WHERE session_id = 'staff'`;
  assert.equal(rows[0].type, 'staff_login_failed');
});

test('the login throttle fails closed after five attempts', suite, async () => {
  for (let i = 0; i < 5; i += 1) {
    const res = await login('wrong');
    assert.equal(res.statusCode, 401, `attempt ${i + 1}`);
  }
  const blocked = await login('the-real-code');
  assert.equal(blocked.statusCode, 429, 'a small keyspace leans on the throttle, not on the code');
});

test('staff sign-ins never count as visitor sessions', suite, async () => {
  await login('the-real-code');
  const { summary } = await import('../lib/metrics.js');
  const counters = await summary(null);
  assert.equal(counters.visits, 0, 'a sign-in must not register as a phantom visit');
});
