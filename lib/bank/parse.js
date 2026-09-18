// Reading a bank's CSV export.
//
// By column name, never by position, trying each field's known aliases in turn,
// because banks rename columns and reorder them between exports and a
// positional reader silently imports the wrong number.
import { createHash } from 'node:crypto';

const ALIASES = {
  date: ['date', 'transaction date', 'completed date', 'started date', 'value date', 'posted date', 'date of transaction'],
  description: ['description', 'reference', 'details', 'narrative', 'transaction description', 'name', 'merchant', 'payee'],
  amount: ['amount', 'value', 'transaction amount', 'money in/out', 'paid in/out'],
  paidIn: ['paid in', 'money in', 'credit', 'credit amount', 'in'],
  paidOut: ['paid out', 'money out', 'debit', 'debit amount', 'out'],
  fee: ['fee', 'fees', 'charges', 'transaction fee'],
  balance: ['balance', 'running balance', 'balance after'],
  state: ['state', 'status'],
  currency: ['currency', 'ccy'],
  id: ['transaction id', 'id', 'reference id', 'transaction reference'],
};

// Handles quoted fields with embedded commas and doubled quotes, which the
// naive split on a comma gets wrong on every description containing one.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function indexHeaders(header) {
  const lower = header.map((h) => h.trim().toLowerCase());
  const found = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    for (const name of names) {
      const at = lower.indexOf(name);
      if (at !== -1) { found[key] = at; break; }
    }
  }
  return found;
}

function money(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/[^0-9.,()-]/g, '').replace(/,/g, '').trim();
  if (!text) return null;
  // A figure in brackets is negative, which is how several exports write it.
  const negative = /^\(.*\)$/.test(text);
  const n = Number(text.replace(/[()]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100);
}

function isoDate(value) {
  const text = String(value || '').trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  // Day first: these are UK bank exports, and 03/04 is the third of April.
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function fingerprint(row, bankId) {
  // The bank's own id where the export has one, otherwise the line itself,
  // running balance included, so two identical payments on one day stay two
  // lines and overlapping months never double up.
  if (bankId) return `id:${bankId}`;
  const parts = [row.happened_on, row.amount_pence, row.description, row.balance ?? ''];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

export function readStatement(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], skipped: 0, headers: [] };

  const at = indexHeaders(rows[0]);
  const out = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const cell = (key) => (at[key] === undefined ? undefined : row[at[key]]);

    const state = String(cell('state') || '').trim().toLowerCase();
    // A pending line can still change, and would otherwise import again,
    // differently, next month. Declined and reverted money never moved.
    if (['pending', 'declined', 'reverted', 'failed'].includes(state)) { skipped += 1; continue; }

    const currency = String(cell('currency') || '').trim().toUpperCase();
    if (currency && currency !== 'GBP') { skipped += 1; continue; }

    const happened = isoDate(cell('date'));
    let amount = money(cell('amount'));
    if (amount === null) {
      const inn = money(cell('paidIn')) || 0;
      const out2 = money(cell('paidOut')) || 0;
      amount = inn - Math.abs(out2);
    }
    if (!happened || !amount) { skipped += 1; continue; }

    // Any fee folded in, so a line is the money that actually moved.
    // A fee always leaves you worse off, whichever way the line points: it
    // comes off money in, and adds to money out.
    const fee = Math.abs(money(cell('fee')) || 0);
    const total = amount - fee;

    const record = {
      happened_on: happened,
      description: String(cell('description') || '').trim().slice(0, 300) || 'No description',
      amount_pence: total,
      balance: money(cell('balance')),
    };
    record.fingerprint = fingerprint(record, String(cell('id') || '').trim());
    out.push(record);
  }

  return { rows: out, skipped, headers: rows[0] };
}
