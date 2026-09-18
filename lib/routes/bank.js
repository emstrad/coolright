// Handlers behind /api/admin/bank.
//
// Every line becomes one of two things, never both: matched to a job payment,
// or split between people. Money out gets one extra job a fixed-fee business
// does not need: it can be assigned to a job as a materials cost, which feeds
// step three of the earnings waterfall and is what makes a job's margin real
// rather than notional.
import { json, readJson, readText, str } from '../http.js';
import { sql } from '../db.js';
import { readStatement } from '../bank/parse.js';
import { normaliseKey, guessCategory, guessSplit, bestMatch } from '../bank/match.js';
import { balance } from '../bank/balance.js';

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);

async function openJobs() {
  const rows = await sql`
    SELECT j.id, j.customer_name, j.postcode, j.price_pence, j.quoted_on, j.job_date,
           COALESCE(sum(p.amount_pence), 0)::bigint AS received
      FROM jobs j LEFT JOIN job_payments p ON p.job_id = j.id
     WHERE j.status IN ('quoted', 'booked', 'completed')
     GROUP BY j.id
     ORDER BY j.id DESC
     LIMIT 500`;
  return rows.map((r) => ({ ...r, outstanding: Number(r.price_pence) - Number(r.received) }));
}

async function rules() {
  const rows = await sql`SELECT * FROM bank_rules`;
  return new Map(rows.map((r) => [r.key, r]));
}

export async function importStatement(req, res) {
  const filename = str(req.query?.filename, 200) || 'statement.csv';
  const text = await readText(req, 4 * 1024 * 1024);
  const { rows, skipped } = readStatement(text);
  if (!rows.length) return json(res, 400, { error: 'no_rows', skipped });

  const [statement] = await sql`
    INSERT INTO bank_statements (filename, rows_total) VALUES (${filename}, ${rows.length})
    RETURNING *`;

  const learned = await rules();
  const jobs = await openJobs();
  let added = 0;

  for (const row of rows) {
    const key = normaliseKey(row.description);
    const rule = learned.get(key);

    // A choice made by hand is never overwritten by a rule learned elsewhere,
    // which is why category_kind and split_kind exist to tell the two apart.
    const category = rule?.category || guessCategory(row.description, row.amount_pence);
    const categoryKind = rule?.category ? 'learned' : (category ? 'guessed' : null);
    const split = rule?.split || guessSplit(row.description, row.amount_pence, []);
    const splitKind = rule?.split ? 'learned' : (split ? 'guessed' : null);

    let jobId = rule?.job_id || null;
    let jobKind = rule?.job_id ? 'learned' : null;

    if (!jobId && !split && row.amount_pence > 0) {
      const { auto } = bestMatch(row, jobs);
      if (auto) { jobId = auto.job_id; jobKind = 'suggested'; }
    }

    const [inserted] = await sql`
      INSERT INTO bank_transactions
        (statement_id, fingerprint, happened_on, description, amount_pence,
         category, category_kind, split, split_kind, job_id, job_kind)
      VALUES (${statement.id}, ${row.fingerprint}, ${row.happened_on}, ${row.description},
              ${row.amount_pence}, ${category}, ${categoryKind},
              ${split ? JSON.stringify(split) : null}, ${splitKind}, ${jobId}, ${jobKind})
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id`;

    if (!inserted) continue;
    added += 1;

    // Money in matched to a job becomes a payment, dated when the money
    // arrived rather than when anybody got round to recording it.
    if (jobId && row.amount_pence > 0) {
      await sql`
        INSERT INTO job_payments (job_id, amount_pence, paid_on, label, note, bank_transaction_id)
        VALUES (${jobId}, ${row.amount_pence}, ${row.happened_on}, 'stage',
                ${`Bank: ${row.description}`.slice(0, 200)}, ${inserted.id})`;
    }
  }

  await sql`UPDATE bank_statements SET rows_new = ${added} WHERE id = ${statement.id}`;
  return json(res, 200, { statement: statement.id, total: rows.length, added, skipped });
}

export async function listTransactions(req, res) {
  const lines = await sql`
    SELECT t.*, j.customer_name
      FROM bank_transactions t LEFT JOIN jobs j ON j.id = t.job_id
     ORDER BY t.happened_on DESC, t.id DESC
     LIMIT 1000`;

  const jobs = await openJobs();
  const statements = await sql`SELECT * FROM bank_statements ORDER BY uploaded_at DESC LIMIT 24`;

  return json(res, 200, {
    statements,
    jobs,
    balance: await balance(),
    transactions: lines.map((line) => ({
      ...line,
      // Suggestions, for a person to confirm. The picker puts them at the top.
      suggestions: line.job_id || line.split || line.amount_pence <= 0
        ? [] : bestMatch(line, jobs).suggestions,
    })),
  });
}

async function learn(line, patch) {
  const key = normaliseKey(line.description);
  if (!key) return;
  await sql`
    INSERT INTO bank_rules (key, category, split, job_id, updated_at)
    VALUES (${key}, ${patch.category ?? null},
            ${patch.split ? JSON.stringify(patch.split) : null}, ${patch.job_id ?? null}, now())
    ON CONFLICT (key) DO UPDATE SET
      category = COALESCE(EXCLUDED.category, bank_rules.category),
      split    = COALESCE(EXCLUDED.split, bank_rules.split),
      job_id   = COALESCE(EXCLUDED.job_id, bank_rules.job_id),
      updated_at = now()`;

  // Applied at once to every untouched line with that key. A line somebody has
  // already decided by hand is left exactly as they left it.
  if (patch.category) {
    await sql`
      UPDATE bank_transactions SET category = ${patch.category}, category_kind = 'learned'
       WHERE id <> ${line.id} AND COALESCE(category_kind, 'guessed') <> 'manual'
         AND regexp_replace(lower(description), '[^a-z ]', ' ', 'g') LIKE ${`%${key.split(' ')[0]}%`}`;
  }
}

async function removeBankPayment(lineId) {
  await sql`DELETE FROM job_payments WHERE bank_transaction_id = ${lineId}`;
}

export async function updateTransaction(req, res) {
  const body = await readJson(req);
  if (!body) return json(res, 400, { error: 'bad_json' });

  const id = int(body.id);
  const [line] = await sql`SELECT * FROM bank_transactions WHERE id = ${id}`;
  if (!line) return json(res, 404, { error: 'not_found' });

  if (body.action === 'unmatch') {
    await removeBankPayment(id);
    await sql`UPDATE bank_transactions SET job_id = NULL, job_kind = NULL WHERE id = ${id}`;
    return json(res, 200, { ok: true, balance: await balance() });
  }

  if (body.action === 'match') {
    const jobId = int(body.job_id);
    if (!jobId) return json(res, 400, { error: 'invalid' });
    // Never both: matching clears any split on the line.
    await removeBankPayment(id);
    await sql`
      UPDATE bank_transactions
         SET job_id = ${jobId}, job_kind = 'manual', split = NULL, split_kind = NULL
       WHERE id = ${id}`;
    if (line.amount_pence > 0) {
      await sql`
        INSERT INTO job_payments (job_id, amount_pence, paid_on, label, note, bank_transaction_id)
        VALUES (${jobId}, ${line.amount_pence}, ${line.happened_on},
                ${['deposit', 'stage', 'balance', 'retention'].includes(body.label) ? body.label : 'stage'},
                ${`Bank: ${line.description}`.slice(0, 200)}, ${id})`;
    }
    if (body.learn) await learn(line, { job_id: jobId });
    return json(res, 200, { ok: true, balance: await balance() });
  }

  if (body.action === 'split') {
    const split = body.split && typeof body.split === 'object' ? body.split : null;
    await removeBankPayment(id);
    await sql`
      UPDATE bank_transactions
         SET split = ${split ? JSON.stringify(split) : null},
             split_kind = ${split ? 'manual' : null},
             job_id = NULL, job_kind = NULL
       WHERE id = ${id}`;
    if (body.learn) await learn(line, { split });
    return json(res, 200, { ok: true, balance: await balance() });
  }

  if (body.action === 'assign') {
    // A spend assigned to a job is a materials cost on that job.
    const jobId = int(body.job_id) || null;
    await sql`
      UPDATE bank_transactions SET job_id = ${jobId}, job_kind = ${jobId ? 'manual' : null},
             split = NULL, split_kind = NULL
       WHERE id = ${id}`;
    if (body.learn) await learn(line, { job_id: jobId });
    return json(res, 200, { ok: true, balance: await balance() });
  }

  if (body.action === 'category') {
    const category = str(body.category, 40) || null;
    await sql`UPDATE bank_transactions SET category = ${category}, category_kind = 'manual' WHERE id = ${id}`;
    if (body.learn) await learn(line, { category });
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'unknown_action' });
}

export async function removeStatement(req, res) {
  const body = await readJson(req);
  const id = int(body?.id);
  if (!id) return json(res, 400, { error: 'invalid' });
  // Removing an upload removes the payments it created, so a mistaken import
  // does not leave half a dozen customers marked as having paid.
  await sql`
    DELETE FROM job_payments
     WHERE bank_transaction_id IN (SELECT id FROM bank_transactions WHERE statement_id = ${id})`;
  await sql`DELETE FROM bank_statements WHERE id = ${id}`;
  return json(res, 200, { ok: true, balance: await balance() });
}
