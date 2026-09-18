// Handlers behind /api/admin/[action].
//
// Vercel counts one serverless function per file under api/, and a Hobby
// deployment takes twelve. Going over fails at the deploy step rather than the
// build, and the log ends cleanly at "Deploying outputs...", which is easy to
// misread for hours. So these are plain (req, res) functions the dispatcher
// picks from and the tests import directly.
import { json, readJson, str } from '../http.js';
import { sql } from '../db.js';
import { marketing, timeline, startOf } from '../metrics.js';
import { pipeline, jobWithPayments } from '../pipeline.js';
import { earnings, paymentState } from '../money.js';
import { validFilePath } from '../validate.js';

const RANGES = new Set(['today', '7d', '30d', 'all']);
const STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled'];
const REASONS = ['price', 'timing', 'went elsewhere', 'no longer needed', 'no reply'];
const LABELS = ['deposit', 'stage', 'balance', 'retention'];

const rangeOf = (req) => {
  const value = str(req.query?.range, 10);
  return startOf(RANGES.has(value) ? value : '30d');
};

const int = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const date = (value) => {
  const text = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

export async function summary(req, res) {
  const since = rangeOf(req);
  const [marketingData, pipelineData] = await Promise.all([marketing(since), pipeline(since)]);
  return json(res, 200, { since, marketing: marketingData, pipeline: pipelineData });
}

export async function leads(req, res) {
  const since = rangeOf(req);
  const data = await marketing(since);
  return json(res, 200, { leads: data.leads });
}

export async function leadTimeline(req, res) {
  const sessionId = str(req.query?.session_id, 64);
  if (!sessionId) return json(res, 400, { error: 'invalid' });
  return json(res, 200, { events: await timeline(sessionId) });
}

export async function jobs(req, res) {
  const status = str(req.query?.status, 20);
  const rows = status && STATUSES.includes(status)
    ? await sql`SELECT * FROM jobs WHERE status = ${status} ORDER BY COALESCE(job_date, quoted_on, created_at::date) DESC LIMIT 500`
    : await sql`SELECT * FROM jobs ORDER BY COALESCE(job_date, quoted_on, created_at::date) DESC LIMIT 500`;

  const [settings] = await sql`SELECT * FROM job_settings WHERE id = 1`;
  const types = await sql`SELECT * FROM job_types WHERE active ORDER BY position, label`;
  const payments = await sql`SELECT * FROM job_payments ORDER BY paid_on, id`;

  const byJob = new Map();
  for (const payment of payments) {
    if (!byJob.has(payment.job_id)) byJob.set(payment.job_id, []);
    byJob.get(payment.job_id).push(payment);
  }

  return json(res, 200, {
    settings,
    types,
    jobs: rows.map((job) => {
      const mine = byJob.get(job.id) || [];
      return { ...job, payments: mine, earnings: earnings(job), payment: paymentState(job, mine) };
    }),
  });
}

export async function saveJob(req, res) {
  const body = await readJson(req);
  if (!body) return json(res, 400, { error: 'bad_json' });

  const status = STATUSES.includes(body.status) ? body.status : 'quoted';
  const name = str(body.customer_name, 120);
  if (!name) return json(res, 400, { error: 'invalid', errors: { customer_name: 'Who is it for?' } });

  // A declined quote without a reason is the one field most often skipped and
  // the one worth the most six months later.
  const reason = REASONS.includes(body.declined_reason) ? body.declined_reason : null;
  if (status === 'declined' && !reason) {
    return json(res, 400, { error: 'invalid', errors: { declined_reason: 'Why was it lost?' } });
  }

  const id = int(body.id);
  const costs = body.costs_pence === null || body.costs_pence === undefined || body.costs_pence === ''
    ? null : int(body.costs_pence);

  const fields = {
    lead_id: int(body.lead_id) || null,
    status,
    customer_name: name,
    phone: str(body.phone, 40) || null,
    email: str(body.email, 160) || null,
    address_line: str(body.address_line, 160) || null,
    town: str(body.town, 80) || null,
    postcode: str(body.postcode, 12) || null,
    job_type: str(body.job_type, 40) || null,
    description: str(body.description, 2000) || null,
    worker: str(body.worker, 80) || null,
    price_pence: int(body.price_pence),
    costs_pence: costs,
    quoted_on: date(body.quoted_on),
    quote_expires: date(body.quote_expires),
    job_date: date(body.job_date),
    completed_on: date(body.completed_on),
    declined_reason: reason,
    notes: str(body.notes, 2000) || null,
  };

  if (id) {
    // Editing a job keeps its original rates. Only a new job takes today's.
    const [row] = await sql`
      UPDATE jobs SET
        lead_id = ${fields.lead_id}, status = ${fields.status},
        customer_name = ${fields.customer_name}, phone = ${fields.phone},
        email = ${fields.email}, address_line = ${fields.address_line},
        town = ${fields.town}, postcode = ${fields.postcode},
        job_type = ${fields.job_type}, description = ${fields.description},
        worker = ${fields.worker}, price_pence = ${fields.price_pence},
        costs_pence = ${fields.costs_pence}, quoted_on = ${fields.quoted_on},
        quote_expires = ${fields.quote_expires}, job_date = ${fields.job_date},
        completed_on = ${fields.completed_on}, declined_reason = ${fields.declined_reason},
        notes = ${fields.notes}, worker_fee_pence = ${int(body.worker_fee_pence)},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *`;
    if (!row) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { job: row, earnings: earnings(row) });
  }

  const [settings] = await sql`SELECT * FROM job_settings WHERE id = 1`;
  const [row] = await sql`
    INSERT INTO jobs (
      lead_id, status, customer_name, phone, email, address_line, town, postcode,
      job_type, description, worker, price_pence, costs_pence, quoted_on,
      quote_expires, job_date, completed_on, declined_reason, notes,
      tax_percent, lead_fee_percent, lead_fee_to, worker_fee_pence, partners
    ) VALUES (
      ${fields.lead_id}, ${fields.status}, ${fields.customer_name}, ${fields.phone},
      ${fields.email}, ${fields.address_line}, ${fields.town}, ${fields.postcode},
      ${fields.job_type}, ${fields.description}, ${fields.worker}, ${fields.price_pence},
      ${fields.costs_pence}, ${fields.quoted_on}, ${fields.quote_expires},
      ${fields.job_date}, ${fields.completed_on}, ${fields.declined_reason}, ${fields.notes},
      ${settings.tax_percent}, ${settings.lead_fee_percent}, ${settings.lead_fee_to},
      ${int(body.worker_fee_pence)}, ${settings.partners}
    ) RETURNING *`;

  return json(res, 200, { job: row, earnings: earnings(row) });
}

export async function payments(req, res) {
  const body = await readJson(req);
  if (!body) return json(res, 400, { error: 'bad_json' });

  if (body.remove) {
    await sql`DELETE FROM job_payments WHERE id = ${int(body.remove)}`;
    return json(res, 200, { ok: true });
  }

  const jobId = int(body.job_id);
  const amount = int(body.amount_pence);
  const paidOn = date(body.paid_on);
  if (!jobId || !amount || !paidOn) return json(res, 400, { error: 'invalid' });

  await sql`
    INSERT INTO job_payments (job_id, amount_pence, paid_on, label, note)
    VALUES (${jobId}, ${amount}, ${paidOn},
            ${LABELS.includes(body.label) ? body.label : 'stage'},
            ${str(body.note, 200) || null})`;

  return json(res, 200, await jobWithPayments(jobId));
}

export async function settings(req, res) {
  if (req.method === 'GET') {
    const [row] = await sql`SELECT * FROM job_settings WHERE id = 1`;
    const types = await sql`SELECT * FROM job_types ORDER BY position, label`;
    return json(res, 200, { settings: row, types });
  }

  const body = await readJson(req);
  if (!body) return json(res, 400, { error: 'bad_json' });

  const partners = Array.isArray(body.partners)
    ? body.partners.map((p) => str(p, 60)).filter(Boolean).slice(0, 6) : [];

  const [row] = await sql`
    UPDATE job_settings SET
      tax_percent = ${Number(body.tax_percent) || 0},
      lead_fee_percent = ${Number(body.lead_fee_percent) || 0},
      lead_fee_to = ${str(body.lead_fee_to, 60) || null},
      worker_fee_to = ${str(body.worker_fee_to, 60) || null},
      partners = ${partners},
      deposit_percent = ${body.deposit_percent === '' || body.deposit_percent === null
    ? null : Number(body.deposit_percent)},
      updated_at = now()
    WHERE id = 1 RETURNING *`;

  return json(res, 200, { settings: row });
}

// A client card is the job joined to the lead it came from, so the address,
// phone, description and photographs are on it without anyone typing them
// twice. There is no clients table.
export async function clients(req, res) {
  const rows = await sql`
    SELECT j.*, l.session_id, l.files, l.notes AS lead_notes, l.job_types AS lead_job_types,
           l.property_type, l.channel,
           COALESCE(sum(p.amount_pence), 0)::bigint AS received,
           max(p.paid_on) AS last_paid_on
      FROM jobs j
      LEFT JOIN leads l ON l.id = j.lead_id
      LEFT JOIN job_payments p ON p.job_id = j.id
     WHERE j.status IN ('booked', 'completed')
     GROUP BY j.id, l.session_id, l.files, l.notes, l.job_types, l.property_type, l.channel
     ORDER BY COALESCE(j.job_date, j.completed_on) DESC NULLS LAST
     LIMIT 500`;

  return json(res, 200, {
    clients: rows.map((row) => ({
      ...row,
      outstanding: Number(row.price_pence) - Number(row.received),
      // A view, not a status change: a date that has passed may have been
      // rescheduled rather than worked, and the calendar should not tell the
      // earnings tiles otherwise. Money still owed keeps a card visible.
      archived: Boolean(row.job_date)
        && new Date(row.job_date) < new Date(new Date().toDateString())
        && !(row.status === 'completed' && Number(row.price_pence) > Number(row.received)),
      datePassed: row.status !== 'completed' && Boolean(row.job_date)
        && new Date(row.job_date) < new Date(new Date().toDateString()),
    })),
  });
}

// The blobs are private, so an attachment is served through here rather than by
// linking the store URL into a page.
export async function attachment(req, res) {
  const path = str(req.query?.path, 200);
  if (!validFilePath(path)) return json(res, 400, { error: 'invalid' });

  const [row] = await sql`SELECT 1 FROM leads WHERE ${path} = ANY (files) LIMIT 1`;
  if (!row) return json(res, 404, { error: 'not_found' });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return json(res, 503, { error: 'unavailable' });

  const { head } = await import('@vercel/blob');
  try {
    const meta = await head(path, { token });
    res.statusCode = 302;
    res.setHeader('Location', meta.downloadUrl || meta.url);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  } catch {
    return json(res, 404, { error: 'not_found' });
  }
}
