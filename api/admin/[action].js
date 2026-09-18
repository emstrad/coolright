// Everything the staff area reads and writes, behind one serverless function.
//
// A Hobby deployment takes twelve functions in total, so related routes group
// behind a bracketed dynamic segment. No URL changes, each handler stays a
// plain (req, res) function, and the tests import them directly.
import { json, actionFrom, requireSameOrigin } from '../../lib/http.js';
import { requireAuth } from '../../lib/session.js';
import * as admin from '../../lib/routes/admin.js';
import * as bank from '../../lib/routes/bank.js';

const GET = {
  summary: admin.summary,
  leads: admin.leads,
  timeline: admin.leadTimeline,
  jobs: admin.jobs,
  clients: admin.clients,
  settings: admin.settings,
  attachment: admin.attachment,
  bank: bank.listTransactions,
};

const POST = {
  job: admin.saveJob,
  payment: admin.payments,
  settings: admin.settings,
  'bank-import': bank.importStatement,
  'bank-update': bank.updateTransaction,
  'bank-remove': bank.removeStatement,
};

export default async function handler(req, res) {
  // Every /api/admin route, without exception.
  if (!requireAuth(req, res)) return;

  const action = actionFrom(req);
  const table = req.method === 'GET' ? GET : POST;

  // Same-origin on every write. There is no Access-Control-Allow-Origin header
  // anywhere in this app, so a cross-origin read is already impossible.
  if (req.method !== 'GET' && !requireSameOrigin(req, res)) return;

  const route = table[action];
  if (!route) return json(res, 404, { error: 'not_found' });

  try {
    return await route(req, res);
  } catch (err) {
    console.error('admin_failed', action, err);
    return json(res, 500, { error: 'failed' });
  }
}

export const config = { api: { bodyParser: false } };
