// The earnings waterfall, in integer pence.
//
// Pounds are a display format, converted at the edge of the browser. Floating
// point cannot hold 0.15 exactly, and a chain of percentage steps in floats
// drifts away from what anyone was actually paid.
//
// The order, on a won job:
//   1. the agreed price
//   2. less tax set aside
//   3. less materials and subcontract costs actually incurred on that job
//   4. less the lead fee, taken on the figure AFTER tax and costs
//   5. less the fee for whoever did the job
//   6. the remainder, split between the partners
//
// Step 3 is the difference between this and a fixed-fee business and it is not
// optional. On quoted work the margin is what is left after materials, and a
// split that ignores them pays people out of money that has already gone to a
// merchant. Step 4 is worth stating: on a 4,000 pound job with 1,500 pounds of
// materials, the lead fee is 15% of (4,000 less tax less 1,500), not of 4,000.

// Halves away from zero, so a loss rounds the same distance as a profit.
export function roundPence(value) {
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const rounded = abs - whole >= 0.5 ? whole + 1 : whole;
  return value < 0 ? -rounded : rounded;
}

export function percentOf(pence, percent) {
  // Percent arrives as a decimal with up to two places. Scaling it to an
  // integer first keeps the multiplication exact for any realistic job value.
  const scaled = Math.round(Number(percent) * 100);
  return roundPence((pence * scaled) / 10000);
}

// Whole pence, and the odd penny goes to the first name in the list, in
// whichever direction the amount points, so the shares always add back to
// exactly what was distributed.
export function splitEvenly(pence, count) {
  if (count <= 0) return [];
  const sign = pence < 0 ? -1 : 1;
  const abs = Math.abs(pence);
  const base = Math.floor(abs / count);
  const spare = abs - base * count;
  return Array.from({ length: count }, (_, i) => sign * (base + (i < spare ? 1 : 0)));
}

/**
 * Works the whole waterfall for one job.
 *
 * costsPence of null means the materials figure is not known yet, which is not
 * the same as zero. The caller is told so it can say as much on the card
 * rather than quietly distributing money that has already been spent.
 */
export function earnings(job) {
  const price = Math.trunc(Number(job.price_pence) || 0);
  const costsKnown = job.costs_pence !== null && job.costs_pence !== undefined;
  const costs = costsKnown ? Math.trunc(Number(job.costs_pence)) : 0;

  const tax = percentOf(price, job.tax_percent ?? 20);
  const afterTax = price - tax;
  const afterCosts = afterTax - costs;

  const leadFee = percentOf(afterCosts, job.lead_fee_percent ?? 15);
  const workerFee = Math.trunc(Number(job.worker_fee_pence) || 0);

  const remainder = afterCosts - leadFee - workerFee;
  const partners = Array.isArray(job.partners) ? job.partners : [];
  const shares = splitEvenly(remainder, partners.length);

  const partnerShares = partners.map((name, i) => ({ name, pence: shares[i] }));

  return {
    price,
    tax,
    costs,
    costsKnown,
    afterTax,
    afterCosts,
    leadFee,
    leadFeeTo: job.lead_fee_to || null,
    workerFee,
    workerFeeTo: job.worker || null,
    remainder,
    partnerShares,
    // A job that lost money splits negative and is shown that way rather than
    // hidden. Pretending a loss is zero is how one quietly gets paid twice.
    lossMaking: remainder < 0,
  };
}

// Everything distributed adds back to the price exactly. The route tests assert
// this after every operation they perform.
export function distributed(job) {
  const e = earnings(job);
  const shares = e.partnerShares.reduce((sum, p) => sum + p.pence, 0);
  return e.tax + e.costs + e.leadFee + e.workerFee + shares;
}

export function totalPaid(payments) {
  return (payments || []).reduce((sum, p) => sum + Math.trunc(Number(p.amount_pence) || 0), 0);
}

// Paid in full is a computed fact, not a flag somebody remembers to set.
export function paymentState(job, payments) {
  const price = Math.trunc(Number(job.price_pence) || 0);
  const received = totalPaid(payments);
  const dates = (payments || []).map((p) => p.paid_on).filter(Boolean).sort();
  return {
    price,
    received,
    outstanding: price - received,
    paidInFull: received >= price && price > 0,
    lastPaidOn: dates.length ? dates[dates.length - 1] : null,
  };
}

export const pounds = (pence) => (Math.trunc(pence) / 100).toFixed(2);
