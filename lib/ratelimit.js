// Throttle counters live in the rate_hits table rather than in process memory.
// Serverless instances do not share memory, so an in-process counter is trivial
// to bypass: spread the requests across cold starts and every one of them
// counts from zero.
import { sql } from './db.js';

// One round trip. The insert sits in a data-modifying CTE and the count is read
// off its RETURNING clause, because a CTE cannot see its own write, so a plain
// SELECT alongside it would miss the row just added.
async function bump(bucket, key, windowSeconds) {
  const rows = await sql`
    WITH win AS (
      SELECT to_timestamp(
        floor(extract(epoch FROM now()) / ${windowSeconds}::int) * ${windowSeconds}::int
      ) AS w
    ), upsert AS (
      INSERT INTO rate_hits (bucket, key, window_start, hits)
      SELECT ${bucket}, ${key}, w, 1 FROM win
      ON CONFLICT (bucket, key, window_start)
        DO UPDATE SET hits = rate_hits.hits + 1
      RETURNING hits
    )
    SELECT hits FROM upsert`;
  return Number(rows[0]?.hits || 0);
}

/**
 * Records one hit and says whether the caller is over the limit.
 *
 * failOpen decides what a database problem means. On the lead and event paths
 * it is true: a database blip must not stop the phone ringing. On the login
 * path it is false, because failing open there hands an attacker the thing the
 * throttle exists to protect.
 */
export async function limit({ bucket, key, windowSeconds, max, failOpen = true }) {
  if (!key) return { allowed: failOpen, hits: 0 };
  try {
    const hits = await bump(bucket, key, windowSeconds);
    return { allowed: hits <= max, hits };
  } catch (err) {
    return { allowed: failOpen, hits: 0, error: err };
  }
}

// 8 leads per 10 minutes per hashed address. Generous: a household with two
// people enquiring from one router must not be blocked.
export const leadLimit = (key) =>
  limit({ bucket: 'lead', key, windowSeconds: 600, max: 8, failOpen: true });

// 60 events per 10 minutes. Enough for a long, thorough visit and nothing like
// enough to flood the table.
export const eventLimit = (key) =>
  limit({ bucket: 'event', key, windowSeconds: 600, max: 60, failOpen: true });

// Login is the pair. A per-address limit alone still lets a pool of addresses
// walk a four digit keyspace, so the second, global counter is the one that
// actually holds. Both fail closed.
export async function loginLimit(ipKey) {
  const perIp = await limit({
    bucket: 'login_ip', key: ipKey, windowSeconds: 900, max: 5, failOpen: false,
  });
  const global = await limit({
    bucket: 'login_all', key: 'all', windowSeconds: 900, max: 50, failOpen: false,
  });
  return { allowed: perIp.allowed && global.allowed, perIp, global };
}
