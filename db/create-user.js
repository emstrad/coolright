// Creates a staff account. The only way a row gets into staff_users.
//
//   node db/create-user.js someone@example.com
//
// There is no seeded account and no default password, because a default
// password is a published password. The password is read from the terminal and
// hashed with argon2id before it goes anywhere near the database.
//
// The login route still uses the single shared access code today. This table
// and this script exist so that moving to per-person accounts later is a route
// change and not a migration, and so the audit trail can stop saying "somebody
// who knew the code".
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import 'dotenv/config';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email.includes('@')) {
  console.error('Usage: node db/create-user.js someone@example.com');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const name = await rl.question('Display name: ');
const suggestion = randomBytes(12).toString('base64url');
const typed = await rl.question(`Password (blank to use ${suggestion}): `);
rl.close();

const password = typed.trim() || suggestion;
if (password.length < 12) {
  console.error('That password is too short. Twelve characters minimum.');
  process.exit(1);
}

// argon2id via @node-rs/argon2, which ships prebuilt binaries for the Lambda
// platform, so a deploy cannot fail on a native compile step.
const passwordHash = await hash(password, { algorithm: 2 });

const url = process.env.DATABASE_URL;
const local = /localhost|127\.0\.0\.1/.test(url || '');
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true } });

await client.connect();
try {
  await client.query(
    `INSERT INTO staff_users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                       display_name = EXCLUDED.display_name`,
    [email, passwordHash, name.trim() || null],
  );
  console.log(`Saved ${email}.`);
  if (!typed.trim()) console.log(`Password: ${password}`);
} finally {
  await client.end();
}
