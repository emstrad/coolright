// POST /api/lead
//
// Stores the enquiry and hands back an id. This runs before the browser posts
// the email relay, so a blocked or ad-blocked browser costs the email and never
// the enquiry.
import { json, requireMethod, requireSameOrigin, readJson, clientIp, ipHash, str } from '../lib/http.js';
import { validateLead, trapped } from '../lib/validate.js';
import { attribute } from '../lib/attribution.js';
import { leadLimit } from '../lib/ratelimit.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const body = await readJson(req);
  if (body === null) return json(res, 400, { error: 'bad_json' });

  // A filled honeypot gets a clean 200 and writes nothing. Telling a bot it
  // failed only teaches it which field to leave alone next time.
  if (trapped(body)) return json(res, 200, { ok: true, id: null });

  const stage = body.stage === 'partial' ? 'partial' : 'complete';
  const { ok, errors, lead } = validateLead(body, { stage });
  if (!ok) return json(res, 400, { error: 'invalid', errors });

  const hash = ipHash(clientIp(req));
  const { allowed } = await leadLimit(hash);
  if (!allowed) return json(res, 429, { error: 'rate_limited' });

  const userAgent = str(req.headers['user-agent'], 400);
  const attr = attribute({ referrer: str(body.referrer, 500), utm: body.utm, userAgent });
  const landing = str(body.landing_path, 200) || null;

  try {
    // Submitting cancels the held partial, but a partial already in flight can
    // still land afterwards. If this session has completed, drop it: one
    // visitor who finished the form is one enquiry, not two.
    if (stage === 'partial') {
      const done = await sql`
        SELECT 1 FROM leads WHERE session_id = ${lead.session_id} AND stage = 'complete' LIMIT 1`;
      if (done.length) return json(res, 200, { ok: true, id: null, superseded: true });
    }

    // COALESCE on the incoming value keeps a late or partial write from
    // blanking a field an earlier write had already filled in.
    const rows = await sql`
      INSERT INTO leads (
        session_id, stage, name, email, phone, postcode, address_line, town,
        property_type, job_types, notes, files, channel, referrer_host,
        landing_path, device, utm, ip_hash, user_agent
      ) VALUES (
        ${lead.session_id}, ${lead.stage}, ${lead.name}, ${lead.email}, ${lead.phone},
        ${lead.postcode}, ${lead.address_line}, ${lead.town}, ${lead.property_type},
        ${lead.job_types}, ${lead.notes}, ${lead.files}, ${attr.channel},
        ${attr.referrer_host}, ${landing}, ${attr.device}, ${JSON.stringify(attr.utm)},
        ${hash}, ${userAgent}
      )
      ON CONFLICT (session_id, stage) DO UPDATE SET
        name          = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
        email         = COALESCE(NULLIF(EXCLUDED.email, ''), leads.email),
        phone         = COALESCE(NULLIF(EXCLUDED.phone, ''), leads.phone),
        postcode      = COALESCE(EXCLUDED.postcode, leads.postcode),
        address_line  = COALESCE(EXCLUDED.address_line, leads.address_line),
        town          = COALESCE(EXCLUDED.town, leads.town),
        property_type = COALESCE(EXCLUDED.property_type, leads.property_type),
        job_types     = CASE WHEN cardinality(EXCLUDED.job_types) > 0
                             THEN EXCLUDED.job_types ELSE leads.job_types END,
        notes         = COALESCE(EXCLUDED.notes, leads.notes),
        files         = CASE WHEN cardinality(EXCLUDED.files) > 0
                             THEN EXCLUDED.files ELSE leads.files END,
        updated_at    = now()
      RETURNING id`;

    const id = rows[0]?.id;

    // Credit every event in this visit to the enquiry it produced. Without this
    // there is no way to tell which channel the work actually came from, which
    // is the only question the ad spend turns on.
    if (id && stage === 'complete') {
      await sql`
        UPDATE events SET lead_id = ${id}
         WHERE session_id = ${lead.session_id} AND lead_id IS NULL`;
    }

    return json(res, 200, { ok: true, id });
  } catch (err) {
    console.error('lead_store_failed', err);
    return json(res, 500, { error: 'store_failed' });
  }
}
