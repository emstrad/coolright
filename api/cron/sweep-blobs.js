// GET /api/cron/sweep-blobs
//
// Monthly. Removes uploads that were never attached to a lead, so an abandoned
// form does not leave a file paying rent for ever.
import { json, requireMethod, str } from '../../lib/http.js';
import { sql } from '../../lib/db.js';

const KEEP_HOURS = 48;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const secret = process.env.CRON_SECRET;
  const auth = str(req.headers.authorization, 200);
  // Vercel sends the secret as a bearer token. Without one configured the route
  // does nothing rather than deleting on an anonymous request.
  if (!secret || auth !== `Bearer ${secret}`) return json(res, 401, { error: 'unauthorised' });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return json(res, 200, { swept: 0, note: 'no blob store configured' });

  const { list, del } = await import('@vercel/blob');
  const cutoff = Date.now() - KEEP_HOURS * 3600 * 1000;

  const attached = new Set(
    (await sql`SELECT unnest(files) AS path FROM leads WHERE cardinality(files) > 0`)
      .map((r) => r.path),
  );

  let swept = 0;
  let cursor;

  do {
    const page = await list({ token, prefix: 'leads/', cursor, limit: 500 });
    const stale = page.blobs.filter((blob) => (
      // Recent uploads are left alone: a form still being filled in has files
      // in the store that no lead row references yet.
      !attached.has(blob.pathname) && new Date(blob.uploadedAt).getTime() < cutoff
    ));
    if (stale.length) {
      await del(stale.map((b) => b.url), { token });
      swept += stale.length;
    }
    cursor = page.cursor;
  } while (cursor);

  return json(res, 200, { swept });
}
