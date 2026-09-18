// The identity the bank page is built around.
//
//   bank in, less bank out  =  each person + the tax pot
//                            + materials assigned to jobs
//                            + payments received on jobs not yet completed
//                            + money in not yet matched or split
//                            + spend not yet split or assigned
//                            + difference
//
// A person's figure is what the completed jobs say they earned plus their
// signed shares of the bank lines, so their drawings and their own spend come
// off it. The tax pot is what completed jobs set aside less what has gone to
// the taxman. Everything is in pence and everything is signed, so the whole
// thing adds up or it does not, and the route tests assert it after every
// operation they perform.
import { sql } from '../db.js';
import { earnings } from '../money.js';

const sum = (rows, pick) => rows.reduce((total, row) => total + Math.trunc(Number(pick(row)) || 0), 0);

export async function balance() {
  // Reconciliation starts at the first imported line unless told otherwise,
  // which stops years of pre-bank history showing up as unexplained.
  const [first] = await sql`SELECT min(happened_on) AS from_date FROM bank_transactions`;
  const from = first?.from_date || null;

  const lines = await sql`
    SELECT id, happened_on, description, amount_pence, split, job_id
      FROM bank_transactions
     WHERE ${from}::date IS NULL OR happened_on >= ${from}`;

  const completed = await sql`
    SELECT * FROM jobs
     WHERE status = 'completed'
       AND (${from}::date IS NULL OR COALESCE(completed_on, job_date, created_at::date) >= ${from})`;

  const openPayments = await sql`
    SELECT p.amount_pence
      FROM job_payments p JOIN jobs j ON j.id = p.job_id
     WHERE j.status <> 'completed'
       AND (${from}::date IS NULL OR p.paid_on >= ${from})`;

  const people = {};
  const add = (name, pence) => {
    if (!name) return;
    people[name] = (people[name] || 0) + pence;
  };

  let taxPot = 0;
  let jobCosts = 0;

  for (const job of completed) {
    const e = earnings(job);
    taxPot += e.tax;
    jobCosts += e.costs;
    if (e.leadFeeTo) add(e.leadFeeTo, e.leadFee);
    if (e.workerFeeTo) add(e.workerFeeTo, e.workerFee);
    for (const share of e.partnerShares) add(share.name, share.pence);
  }

  let assignedSpend = 0;
  let unmatchedIn = 0;
  let unallocatedOut = 0;

  for (const line of lines) {
    const amount = Math.trunc(Number(line.amount_pence));

    if (line.job_id) {
      // Only money out is a materials cost. Money in against a job is a
      // customer payment, and it is already represented by the job_payments
      // row the match created: through onOpenJobs while the job is open, and
      // through the job's own price once it is completed.
      if (amount < 0) assignedSpend += amount;
      continue;
    }

    const split = line.split && typeof line.split === 'object' ? line.split : null;
    if (split) {
      const names = Object.keys(split);
      const weights = names.reduce((t, n) => t + (Number(split[n]) || 0), 0) || names.length;
      // Whole pence, and the odd penny to the earliest name, so a split always
      // adds back to the line it came from.
      let left = amount;
      names.forEach((name, i) => {
        const share = i === names.length - 1
          ? left
          : Math.trunc((amount * (Number(split[name]) || 1)) / weights);
        left -= share;
        if (name === 'tax') taxPot += share;
        else add(name, share);
      });
      continue;
    }

    if (amount > 0) unmatchedIn += amount;
    else unallocatedOut += amount;
  }

  // Zero when the cost recorded on a job equals what actually left the bank for
  // it. Nonzero means a merchant invoice has been assigned but never written
  // onto the job, or the other way round.
  const materials = jobCosts + assignedSpend;

  const net = sum(lines, (l) => l.amount_pence);
  const onOpenJobs = sum(openPayments, (p) => p.amount_pence);
  const peopleTotal = Object.values(people).reduce((a, b) => a + b, 0);

  const allocated = peopleTotal + taxPot + materials + onOpenJobs + unmatchedIn + unallocatedOut;

  return {
    from,
    bankIn: lines.filter((l) => l.amount_pence > 0).reduce((t, l) => t + Number(l.amount_pence), 0),
    bankOut: lines.filter((l) => l.amount_pence < 0).reduce((t, l) => t + Number(l.amount_pence), 0),
    net,
    people,
    taxPot,
    materials,
    onOpenJobs,
    unmatchedIn,
    unallocatedOut,
    // The only line that can be nonzero once everything is allocated: bank
    // money on completed jobs against what those jobs are recorded as worth,
    // which is where a cash-paid job or an overpayment shows up rather than
    // quietly vanishing.
    difference: net - allocated,
    // The two sides, so a caller can compare them rather than take the
    // subtraction on trust. With everything allocated and every job recorded
    // honestly, allocated equals net and the difference is zero.
    allocated,
  };
}
