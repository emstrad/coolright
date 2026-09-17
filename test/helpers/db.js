// Integration tests run the real handlers against a real Postgres. Only
// lib/db.js is swapped; everything else in the path is the shipping code.
//
// There is no local server in some environments, so a test file without
// TEST_DATABASE_URL skips rather than fails, and CI supplies one.
import { mock } from 'node:test';
import pg from 'pg';

export const DB_URL = process.env.TEST_DATABASE_URL || '';
export const hasDb = Boolean(DB_URL);

let client = null;

// Turns the tagged template the app uses into a parameterised pg query, so the
// handlers' SQL is executed exactly as written rather than reimplemented.
function makeSql(pgClient) {
  return async function sql(strings, ...values) {
    let text = '';
    strings.forEach((part, i) => {
      text += part;
      if (i < values.length) text += `$${i + 1}`;
    });
    const result = await pgClient.query(text, values);
    return result.rows;
  };
}

export async function startDb() {
  client = new pg.Client({ connectionString: DB_URL, ssl: false });
  await client.connect();
  const sql = makeSql(client);
  mock.module('../lib/db.js', {
    namedExports: {
      sql,
      ping: async () => true,
      tablesPresent: async () => ['events', 'leads', 'rate_hits', 'staff_users'],
    },
  });
  return { client, sql };
}

export async function truncate() {
  // Test files are run one at a time for exactly this reason: in parallel they
  // empty each other's data mid-test and fail at random.
  await client.query('TRUNCATE events, leads, rate_hits RESTART IDENTITY CASCADE');
}

export async function stopDb() {
  if (client) await client.end();
  client = null;
}

// A minimal stand-in for the request and response objects Vercel passes in.
export function fakeReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return {
    method,
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ...headers },
    body,
    query: {},
    socket: { remoteAddress: '203.0.113.9' },
  };
}

export function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(text) { this.payload = text ? JSON.parse(text) : null; },
  };
}
