// POST /api/notified
//
// The browser posts the email relay, so the server cannot know whether the
// enquiry actually reached the inbox. This is how it finds out.
//
// The distinction matters: "we have the lead and the email went" and "we have
// the lead and nobody was told" look identical on a dashboard that does not
// record it, and the second one is a missed job.
import { json, requireMethod, requireSameOrigin, readJson, str } from '../lib/http.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const body = await readJson(req);
  if (body === null) return json(res, 400, { error: 'bad_json' });

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'invalid' });

  const ok = body.ok === true;
  const error = ok ? null : str(body.error, 120) || 'unknown';

  try {
    await sql`
      UPDATE leads
         SET notified_at = ${ok ? new Date().toISOString() : null},
             notify_error = ${error},
             updated_at = now()
       WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('notified_update_failed', err);
    return json(res, 200, { ok: false });
  }
}
