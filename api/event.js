// POST /api/event
//
// The cookieless interaction log. No third party analytics, no advertising
// cookies, nothing that follows anybody off this site: the only cookie the site
// sets is the staff session.
import { json, requireMethod, requireSameOrigin, readJson, clientIp, ipHash, str } from '../lib/http.js';
import { attribute } from '../lib/attribution.js';
import { eventLimit } from '../lib/ratelimit.js';
import { sql } from '../lib/db.js';

const TYPES = new Set([
  'page_view', 'form_start', 'step_complete', 'field_error',
  'call_click', 'submit', 'submit_error', 'upload',
]);

// An allow-list rather than a filter: anything not named here is somebody's
// experiment or somebody's payload, and neither belongs in a jsonb column the
// dashboard renders.
const DETAIL_KEYS = ['step', 'field', 'placement', 'reason', 'name', 'count', 'ms'];

function cleanDetail(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of DETAIL_KEYS) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 120);
  }
  // Hard 1KB ceiling whatever the allow-list let through.
  return JSON.stringify(out).length > 1024 ? {} : out;
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const body = await readJson(req);
  if (body === null) return json(res, 400, { error: 'bad_json' });

  const sessionId = str(body.session_id, 64);
  const type = str(body.type, 40);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId) || !TYPES.has(type)) {
    return json(res, 400, { error: 'invalid' });
  }

  const hash = ipHash(clientIp(req));
  const { allowed } = await eventLimit(hash);
  if (!allowed) return json(res, 429, { error: 'rate_limited' });

  const attr = attribute({
    referrer: str(body.referrer, 500),
    utm: body.utm,
    userAgent: str(req.headers['user-agent'], 400),
  });

  try {
    await sql`
      INSERT INTO events (session_id, type, detail, path, channel, referrer_host, device, utm, ip_hash)
      VALUES (${sessionId}, ${type}, ${JSON.stringify(cleanDetail(body.detail))},
              ${str(body.path, 200) || null}, ${attr.channel}, ${attr.referrer_host},
              ${attr.device}, ${JSON.stringify(attr.utm)}, ${hash})`;
    return json(res, 200, { ok: true });
  } catch (err) {
    // An event that fails to record is a gap in a report. It is never a reason
    // to show the visitor an error.
    console.error('event_store_failed', err);
    return json(res, 200, { ok: false });
  }
}
