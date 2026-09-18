// Quote conversion, the diary, and money owed.
//
// Conversion is the headline number of a quoted business: it is the difference
// between a business that is busy and one that is profitable, and almost nobody
// in the trades measures it.
import { sql } from './db.js';
import { earnings, paymentState } from './money.js';

const WON = ['booked', 'completed'];
const LOST = ['declined', 'cancelled'];

export async function conversion(since) {
  const rows = await sql`
    WITH q AS (
      SELECT * FROM jobs
       WHERE quoted_on IS NOT NULL
         AND (${since}::timestamptz IS NULL OR quoted_on >= ${since}::timestamptz::date)
    )
    SELECT
      count(*)::int                                                    AS sent,
      count(*) FILTER (WHERE status IN ('booked', 'completed'))::int   AS won,
      count(*) FILTER (WHERE status IN ('declined', 'cancelled'))::int AS lost,
      count(*) FILTER (WHERE status = 'quoted')::int                   AS open,
      COALESCE(avg(price_pence), 0)::bigint                            AS avg_quote,
      COALESCE(avg(price_pence) FILTER (WHERE status IN ('booked', 'completed')), 0)::bigint AS avg_won,
      COALESCE(sum(price_pence) FILTER (WHERE status = 'quoted'), 0)::bigint AS open_value
      FROM q`;

  const row = rows[0];
  const decided = row.won + row.lost;
  return {
    ...row,
    // Rate against decided quotes, not against every quote sent. A quote from
    // yesterday that nobody has answered is not a loss yet, and counting it as
    // one makes every recent week look like a disaster.
    rate: decided ? Math.round((row.won / decided) * 1000) / 10 : null,
  };
}

export async function conversionBy(field, since) {
  // Two callers only, and the column name is chosen here rather than taken
  // from the request, so there is nothing for a caller to inject.
  const column = field === 'channel' ? 'channel' : 'job_type';
  const rows = column === 'channel'
    ? await sql`
      SELECT COALESCE(l.channel, 'unknown') AS label,
             count(*)::int AS sent,
             count(*) FILTER (WHERE j.status IN ('booked', 'completed'))::int AS won
        FROM jobs j LEFT JOIN leads l ON l.id = j.lead_id
       WHERE j.quoted_on IS NOT NULL
         AND (${since}::timestamptz IS NULL OR j.quoted_on >= ${since}::timestamptz::date)
       GROUP BY 1 ORDER BY sent DESC`
    : await sql`
      SELECT COALESCE(j.job_type, 'unknown') AS label,
             count(*)::int AS sent,
             count(*) FILTER (WHERE j.status IN ('booked', 'completed'))::int AS won
        FROM jobs j
       WHERE j.quoted_on IS NOT NULL
         AND (${since}::timestamptz IS NULL OR j.quoted_on >= ${since}::timestamptz::date)
       GROUP BY 1 ORDER BY sent DESC`;

  return rows.map((r) => ({ ...r, rate: r.sent ? Math.round((r.won / r.sent) * 1000) / 10 : null }));
}

// A quote sent three weeks ago with no decision is a follow-up call, and the
// board should say so rather than letting it sit.
export async function staleQuotes(days = 21) {
  return sql`
    SELECT id, customer_name, phone, postcode, price_pence, quoted_on, quote_expires
      FROM jobs
     WHERE status = 'quoted' AND quoted_on IS NOT NULL
       AND quoted_on <= (current_date - ${days}::int)
     ORDER BY quoted_on
     LIMIT 50`;
}

export async function diary() {
  return sql`
    SELECT id, customer_name, phone, postcode, job_type, job_date, price_pence, worker
      FROM jobs
     WHERE status = 'booked' AND job_date IS NOT NULL AND job_date >= current_date
     ORDER BY job_date
     LIMIT 50`;
}

// The most important rows on the whole dashboard: finished work that has not
// been paid for, oldest first, with the phone number right there.
export async function owed() {
  const rows = await sql`
    SELECT j.id, j.customer_name, j.phone, j.postcode, j.price_pence, j.completed_on,
           COALESCE(sum(p.amount_pence), 0)::bigint AS received
      FROM jobs j LEFT JOIN job_payments p ON p.job_id = j.id
     WHERE j.status = 'completed'
     GROUP BY j.id
    HAVING COALESCE(sum(p.amount_pence), 0) < j.price_pence
     ORDER BY j.completed_on NULLS LAST
     LIMIT 50`;
  return rows.map((r) => ({ ...r, outstanding: Number(r.price_pence) - Number(r.received) }));
}

export async function earningsTotals(since) {
  // Only completed work counts towards what anyone has earned. A booked job is
  // a promise, and paying people out of promises is how a business runs out of
  // money in a quiet month.
  const jobs = await sql`
    SELECT * FROM jobs
     WHERE status = 'completed'
       AND (${since}::timestamptz IS NULL OR COALESCE(completed_on, job_date) >= ${since}::timestamptz::date)`;

  const totals = { price: 0, tax: 0, costs: 0, leadFees: {}, workerFees: {}, partners: {}, unknownCosts: 0 };

  for (const job of jobs) {
    const e = earnings(job);
    totals.price += e.price;
    totals.tax += e.tax;
    totals.costs += e.costs;
    if (!e.costsKnown) totals.unknownCosts += 1;
    if (e.leadFee && e.leadFeeTo) {
      totals.leadFees[e.leadFeeTo] = (totals.leadFees[e.leadFeeTo] || 0) + e.leadFee;
    }
    if (e.workerFee && e.workerFeeTo) {
      totals.workerFees[e.workerFeeTo] = (totals.workerFees[e.workerFeeTo] || 0) + e.workerFee;
    }
    for (const share of e.partnerShares) {
      totals.partners[share.name] = (totals.partners[share.name] || 0) + share.pence;
    }
  }

  totals.jobs = jobs.length;
  return totals;
}

export async function jobWithPayments(id) {
  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id}`;
  if (!job) return null;
  const payments = await sql`SELECT * FROM job_payments WHERE job_id = ${id} ORDER BY paid_on, id`;
  return { job, payments, earnings: earnings(job), payment: paymentState(job, payments) };
}

export async function pipeline(since) {
  const [rate, byType, byChannel, stale, booked, unpaid, totals] = await Promise.all([
    conversion(since), conversionBy('job_type', since), conversionBy('channel', since),
    staleQuotes(), diary(), owed(), earningsTotals(since),
  ]);
  return { rate, byType, byChannel, stale, booked, unpaid, totals };
}

export { WON, LOST };
