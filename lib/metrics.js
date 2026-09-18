// Dashboard numbers, aggregated in SQL.
//
// Nothing here pulls a table into JavaScript to count it, so the dashboard
// stays fast as the events table grows past the point where that would matter.
import { sql } from './db.js';

const ZONE = 'Europe/London';

// "Today" is a local day, not a UTC one. In British Summer Time a UTC day
// starts at 1am, and an enquiry at half past midnight would land on yesterday.
export function startOf(range, now = new Date()) {
  if (range === 'all') return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).reduce((out, p) => {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
    return out;
  }, {});

  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const midnight = Date.UTC(parts.year, parts.month - 1, parts.day) - offset;

  const days = range === '7d' ? 6 : range === '30d' ? 29 : 0;
  return new Date(midnight - days * 86400000).toISOString();
}

// Staff sign-ins share the events table and are excluded from every visitor
// metric here, by the session_id <> 'staff' clause repeated in each query.
// Left in, each one registers as a phantom session and dilutes the conversion
// rates.

export async function summary(since) {
  const rows = await sql`
    WITH v AS (
      SELECT * FROM events
       WHERE session_id <> 'staff' AND (${since}::timestamptz IS NULL OR created_at >= ${since})
    ), l AS (
      SELECT * FROM leads
       WHERE ${since}::timestamptz IS NULL OR created_at >= ${since}
    )
    SELECT
      (SELECT count(DISTINCT session_id) FROM v)::int                      AS visits,
      (SELECT count(*) FROM v WHERE type = 'page_view')::int               AS page_views,
      (SELECT count(DISTINCT session_id) FROM v WHERE type = 'form_start')::int AS form_starts,
      (SELECT count(*) FROM l WHERE stage = 'complete')::int               AS enquiries,
      (SELECT count(*) FROM l WHERE stage = 'partial')::int                AS partials,
      (SELECT count(*) FROM v WHERE type = 'call_click')::int              AS call_clicks,
      (SELECT count(*) FROM l WHERE stage = 'complete' AND notified_at IS NULL)::int AS unnotified`;
  return rows[0];
}

export async function funnel(since) {
  // Drop-off at each step. A step that loses a third of the people who reached
  // it is a step with a problem in it.
  return sql`
    SELECT (detail->>'step')::int AS step, count(DISTINCT session_id)::int AS sessions
      FROM events
     WHERE type = 'step_complete' AND session_id <> 'staff'
       AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY 1`;
}

export async function fieldErrors(since) {
  return sql`
    SELECT detail->>'field' AS field, count(*)::int AS hits
      FROM events
     WHERE type = 'field_error' AND session_id <> 'staff'
       AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY hits DESC NULLS LAST LIMIT 20`;
}

export async function callsByPlacement(since) {
  return sql`
    SELECT COALESCE(detail->>'placement', 'unknown') AS placement, count(*)::int AS hits
      FROM events
     WHERE type = 'call_click' AND session_id <> 'staff'
       AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY hits DESC LIMIT 10`;
}

export async function byChannel(since) {
  return sql`
    SELECT COALESCE(channel, 'unknown') AS channel,
           count(*) FILTER (WHERE stage = 'complete')::int AS enquiries,
           count(*) FILTER (WHERE stage = 'partial')::int  AS partials
      FROM leads
     WHERE ${since}::timestamptz IS NULL OR created_at >= ${since}
     GROUP BY 1 ORDER BY enquiries DESC`;
}

export async function byReferrer(since) {
  return sql`
    SELECT COALESCE(referrer_host, 'none') AS host, count(*)::int AS enquiries
      FROM leads
     WHERE stage = 'complete' AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY enquiries DESC LIMIT 15`;
}

export async function byCampaign(since) {
  return sql`
    SELECT utm->>'utm_campaign' AS campaign, count(*)::int AS enquiries
      FROM leads
     WHERE stage = 'complete' AND utm->>'utm_campaign' IS NOT NULL
       AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY enquiries DESC LIMIT 15`;
}

export async function landingPages(since) {
  return sql`
    SELECT COALESCE(landing_path, '/') AS path, count(*)::int AS enquiries
      FROM leads
     WHERE stage = 'complete' AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY enquiries DESC LIMIT 15`;
}

export async function byDevice(since) {
  return sql`
    SELECT COALESCE(device, 'unknown') AS device, count(*)::int AS enquiries
      FROM leads
     WHERE stage = 'complete' AND (${since}::timestamptz IS NULL OR created_at >= ${since})
     GROUP BY 1 ORDER BY enquiries DESC`;
}

export async function leadList(since, limit = 200) {
  return sql`
    SELECT id, session_id, stage, name, email, phone, postcode, address_line, town,
           property_type, job_types, notes, files, channel, referrer_host, device,
           landing_path, notified_at, notify_error, created_at
      FROM leads
     WHERE ${since}::timestamptz IS NULL OR created_at >= ${since}
     ORDER BY created_at DESC
     LIMIT ${limit}`;
}

export async function timeline(sessionId) {
  return sql`
    SELECT type, detail, path, created_at
      FROM events
     WHERE session_id = ${sessionId}
     ORDER BY created_at`;
}

export async function marketing(since) {
  // One call, so the dashboard makes one request and every panel is consistent
  // with the others rather than a few seconds apart.
  const [
    counters, steps, errors, calls, channels, referrers, campaigns, pages, devices, leads,
  ] = await Promise.all([
    summary(since), funnel(since), fieldErrors(since), callsByPlacement(since),
    byChannel(since), byReferrer(since), byCampaign(since), landingPages(since),
    byDevice(since), leadList(since),
  ]);
  return { counters, steps, errors, calls, channels, referrers, campaigns, pages, devices, leads };
}
