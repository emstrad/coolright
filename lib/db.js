// The one place that talks to Postgres.
//
// Everything else imports the `sql` tagged template from here, which is what
// lets the integration tests swap this single module for a pg client pointed at
// a real local Postgres and run the shipping handlers against real SQL.
//
// Values interpolated into the template are always parameterised by the driver,
// so string building never reaches the database.
import { neon } from '@neondatabase/serverless';

let client = null;

function connection() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // The pooled string (its host contains -pooler) is the one to use: a
  // serverless function opens and drops connections far too fast for a direct
  // endpoint to keep up.
  client = neon(url);
  return client;
}

export function sql(strings, ...values) {
  return connection()(strings, ...values);
}

// Cheap liveness probe for /api/health. Returns true, or throws.
export async function ping() {
  const rows = await sql`SELECT 1 AS ok`;
  return rows.length === 1;
}

// Used by /api/health to report whether the schema has actually been applied,
// because "the database answers" and "the tables exist" are different failures
// and get confused with each other at exactly the wrong moment.
export async function tablesPresent() {
  const rows = await sql`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('leads', 'events', 'staff_users', 'rate_hits')`;
  return rows.map((r) => r.table_name).sort();
}
