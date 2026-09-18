// Guessing what a bank line is, and which job a payment belongs to.
//
// Everything here is a suggestion until a person confirms it, except where one
// candidate wins outright. A wrong match marks the wrong customer as paid,
// which is worse than leaving a line unmatched.

// Built for this trade. A roofer's list would be scaffold and skips; this one
// is refrigerant, wholesalers and plant.
const CATEGORIES = [
  ['materials', ['wolseley', 'city plumbing', 'plumbase', 'bes ', 'dean and wood', 'hrp', 'climate center', 'refrigerant', 'f-gas', 'fgas', 'toolstation', 'screwfix', 'travis perkins', 'jewson', 'rs components', 'cef', 'edmundson', 'advanced engineering']],
  ['plant hire', ['hire station', 'hss', 'speedy hire', 'brandon hire', 'scaffold', 'access platform', 'powered access', 'nationwide platforms']],
  ['vehicle', ['fuel', 'shell', 'bp ', 'esso', 'texaco', 'congestion', 'ulez', 'dart charge', 'parking', 'ringgo', 'justpark', 'euro car parts', 'halfords', 'kwik fit', 'dvla']],
  ['insurance', ['insurance', 'underwriting', 'hiscox', 'axa', 'aviva', 'simply business']],
  ['software', ['google', 'microsoft', 'adobe', 'vercel', 'neon', 'xero', 'quickbooks', 'freeagent', 'dropbox', 'apple.com/bill']],
  ['marketing', ['google ads', 'meta platforms', 'facebook', 'checkatrade', 'yell', 'bark.com', 'mailchimp']],
  ['training', ['f-gas training', 'logic4training', 'city and guilds', 'refcom']],
  ['bank charges', ['charge', 'overdraft', 'interest']],
  ['tax', ['hmrc', 'hm revenue', 'vat return', 'paye']],
];

export function normaliseKey(description) {
  // Numbers stripped, so "TRAVIS PERKINS 1234" and "TRAVIS PERKINS 5678" share
  // a key and one decision teaches both.
  return String(description || '')
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function guessCategory(description, amount) {
  const text = String(description || '').toLowerCase();
  for (const [name, needles] of CATEGORIES) {
    if (needles.some((needle) => text.includes(needle))) return name;
  }
  return amount > 0 ? null : 'uncategorised';
}

// A split is guessed only where the line itself says whose money it is: a
// transfer out to a partner by name, a top-up from one, or a payment to the
// taxman. A card payment to a shop with a partner's name in it is a shop, and a
// transfer in from someone sharing a partner's first name is a customer.
export function guessSplit(description, amount, partners = []) {
  const text = String(description || '').toLowerCase();
  const isTransfer = /(transfer|faster payment|bank giro|standing order|to a\/c|from a\/c)/.test(text);
  const isCard = /(card|contactless|pos |chip and pin|apple pay|google pay)/.test(text);

  if (/hmrc|hm revenue|paye|vat return/.test(text)) return { tax: 1 };
  if (!isTransfer || isCard) return null;

  for (const partner of partners) {
    const name = String(partner).toLowerCase();
    if (name && text.includes(name)) return { [partner]: 1 };
  }
  return null;
}

/**
 * Scores money in against the outstanding amounts on open jobs, not just
 * against the job price, so a 1,200 pound line matches the deposit on a 4,800
 * pound job rather than matching nothing at all.
 */
export function scoreCandidates(line, jobs) {
  const text = String(line.description || '').toLowerCase().replace(/\s+/g, '');
  const amount = line.amount_pence;

  return jobs.map((job) => {
    let score = 0;
    const outstanding = Number(job.outstanding ?? job.price_pence);

    if (amount === outstanding) score += 55;
    else if (amount === Number(job.price_pence)) score += 45;
    else if (outstanding > 0 && amount < outstanding) score += 12;

    const name = String(job.customer_name || '').toLowerCase().replace(/\s+/g, '');
    if (name.length > 3 && text.includes(name)) score += 30;
    else {
      const surname = String(job.customer_name || '').split(/\s+/).pop()?.toLowerCase() || '';
      if (surname.length > 3 && text.includes(surname)) score += 18;
    }

    const postcode = String(job.postcode || '').toLowerCase().replace(/\s+/g, '');
    if (postcode.length > 3 && text.includes(postcode)) score += 20;

    const reference = String(job.id);
    if (text.includes(`job${reference}`) || text.includes(`inv${reference}`)) score += 25;

    // Money arriving long before the quote went out is not this job's.
    if (job.quoted_on && line.happened_on < job.quoted_on) score -= 40;
    else if (job.job_date) {
      const days = Math.abs(
        (new Date(line.happened_on) - new Date(job.job_date)) / 86400000,
      );
      if (days <= 45) score += 8;
    }

    return { job_id: job.id, customer_name: job.customer_name, outstanding, score };
  })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Automatic only when one candidate clearly wins and beats the runner-up
// outright. Anything closer is a suggestion at the top of the picker for a
// person to confirm.
export function bestMatch(line, jobs) {
  if (line.amount_pence <= 0) return { auto: null, suggestions: [] };
  const ranked = scoreCandidates(line, jobs);
  if (!ranked.length) return { auto: null, suggestions: [] };

  const [first, second] = ranked;
  const clear = first.score >= 70 && (!second || first.score - second.score >= 25);
  return { auto: clear ? first : null, suggestions: ranked.slice(0, 5) };
}
