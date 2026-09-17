// GET /api/health
//
// Reports the two failures that get confused with each other at the worst
// moment: the database not answering, and the schema not having been applied.
import { json, requireMethod } from '../lib/http.js';
import { ping, tablesPresent } from '../lib/db.js';

const EXPECTED = ['events', 'leads', 'rate_hits', 'staff_users'];

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const out = { ok: false, db: false, schema: false, missing: [], at: new Date().toISOString() };

  try {
    out.db = await ping();
    const present = await tablesPresent();
    out.missing = EXPECTED.filter((t) => !present.includes(t));
    out.schema = out.missing.length === 0;
  } catch (err) {
    out.error = err.message;
  }

  out.ok = out.db && out.schema;
  return json(res, out.ok ? 200 : 503, out);
}
