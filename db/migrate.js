// Applies db/schema.sql. Safe to run repeatedly: the schema only adds things.
// Uses pg rather than the Neon HTTP driver because the file contains several
// statements and wants one connection for the lot.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  // Neon needs TLS; a local test Postgres does not offer it.
  const local = /localhost|127\.0\.0\.1/.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: true },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
