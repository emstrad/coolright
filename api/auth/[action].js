// POST /api/auth/login and /api/auth/logout
//
// One shared access code in an environment variable. The code has a small
// keyspace, so this route leans on the throttles rather than on the code's
// strength: five failures per address per fifteen minutes, and fifty across all
// addresses, because a per-address limit alone still lets a pool of addresses
// walk a four digit keyspace. Both fail closed.
//
// Know the trade-off: one code means no per-person audit trail, and every log
// line says "someone who knew the code". The staff_users table and the create
// user script exist so moving to per-person accounts later is a route change
// and not a migration.
import { timingSafeEqual } from 'node:crypto';
import { json, requireMethod, requireSameOrigin, readJson, actionFrom, clientIp, ipHash, str } from '../../lib/http.js';
import { issue, cookieHeader } from '../../lib/session.js';
import { loginLimit } from '../../lib/ratelimit.js';
import { sql } from '../../lib/db.js';

// Constant time, and length-padded so the comparison itself does not leak how
// long the real code is.
function same(a, b) {
  const left = Buffer.from(String(a).padEnd(64).slice(0, 64));
  const right = Buffer.from(String(b).padEnd(64).slice(0, 64));
  return timingSafeEqual(left, right) && String(a).length === String(b).length;
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const action = actionFrom(req);

  if (action === 'logout') {
    res.setHeader('Set-Cookie', cookieHeader(''));
    return json(res, 200, { ok: true });
  }

  if (action !== 'login') return json(res, 404, { error: 'not_found' });

  const hash = ipHash(clientIp(req));
  const { allowed } = await loginLimit(hash || 'unknown');
  if (!allowed) return json(res, 429, { error: 'rate_limited' });

  const body = await readJson(req);
  const code = str(body?.code, 200);
  const expected = process.env.STAFF_ACCESS_CODE;

  // Unknown and wrong do the same work and return the same message, so the
  // response cannot be used to learn anything about the code.
  if (!expected || !code || !same(code, expected)) {
    try {
      await sql`INSERT INTO events (session_id, type, detail, ip_hash)
                VALUES ('staff', 'staff_login_failed', '{}'::jsonb, ${hash})`;
    } catch {
      // A failed audit write is not a reason to let the attempt through, and
      // not a reason to answer differently either.
    }
    return json(res, 401, { error: 'wrong' });
  }

  try {
    // Staff logins share the events table but are excluded from every visitor
    // metric, otherwise each sign-in registers as a phantom session and dilutes
    // the conversion rates.
    await sql`INSERT INTO events (session_id, type, detail, ip_hash)
              VALUES ('staff', 'staff_login', '{}'::jsonb, ${hash})`;
  } catch {
    // Same again: the sign-in itself is what matters.
  }

  res.setHeader('Set-Cookie', cookieHeader(issue()));
  return json(res, 200, { ok: true });
}
