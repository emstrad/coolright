// Server side lead validation. Nothing from the client is trusted, and the
// error strings match the copy already sitting in the markup, so a 400 shows
// the field message that was always going to be there rather than a second,
// differently worded one.

// The offered values, and only these. A job type outside the list is either a
// stale cached page or somebody poking, and neither should reach the reports.
export const JOB_TYPES = [
  'New AC installation',
  'Servicing',
  'Repair / not cooling',
  'Heating / heat pump',
  'Ventilation / MVHR',
  'Not sure',
];

export const PROPERTY_TYPES = [
  'House',
  'Flat or apartment',
  'Office',
  'Retail or hospitality',
  'Server or comms room',
  'Other commercial',
];

const MESSAGES = {
  name: 'Please enter your first name.',
  email: 'Please enter a valid email address.',
  postcode: 'Please enter your postcode.',
  job_types: 'Pick at least one, "Not sure yet" is fine.',
  property_type: 'Please choose one.',
};

// Deliberately shape-only. A regex that tries to decide whether an address is
// deliverable rejects real people, and the phone call is the fallback anyway.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/;

export function normalisePostcode(value) {
  const raw = String(value || '').toUpperCase().replace(/\s+/g, '');
  if (raw.length < 5 || raw.length > 7) return null;
  const spaced = `${raw.slice(0, -3)} ${raw.slice(-3)}`;
  return POSTCODE_RE.test(spaced) ? spaced : null;
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Attachment paths are checked against the exact shape this app writes, so the
// column cannot be made to point the staff dashboard at somebody else's blob.
export function validFilePath(path) {
  return typeof path === 'string' && /^leads\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/.test(path);
}

export function validateLead(input, { stage = 'complete' } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const lead = {};

  lead.session_id = text(body.session_id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(lead.session_id)) errors.session_id = 'Invalid session.';

  lead.stage = stage === 'partial' ? 'partial' : 'complete';

  lead.name = text(body.name, 80);
  if (!lead.name) errors.name = MESSAGES.name;

  lead.email = text(body.email, 160).toLowerCase();
  if (!EMAIL_RE.test(lead.email)) errors.email = MESSAGES.email;

  lead.postcode = normalisePostcode(body.postcode);
  if (!lead.postcode) errors.postcode = MESSAGES.postcode;

  lead.phone = text(body.phone, 30).replace(/[^\d+()\s-]/g, '');

  const types = Array.isArray(body.job_types) ? body.job_types : [];
  lead.job_types = types.filter((t) => JOB_TYPES.includes(t)).slice(0, JOB_TYPES.length);

  lead.property_type = PROPERTY_TYPES.includes(body.property_type) ? body.property_type : null;

  // Steps two and three only exist on a completed form, so a partial is held to
  // step one and nothing more.
  if (lead.stage === 'complete') {
    if (!lead.job_types.length) errors.job_types = MESSAGES.job_types;
    if (!lead.property_type) errors.property_type = MESSAGES.property_type;
  }

  lead.address_line = text(body.address_line, 160) || null;
  lead.town = text(body.town, 80) || null;
  lead.notes = text(body.notes, 2000) || null;
  lead.existing_system = body.existing_system === true;

  const files = Array.isArray(body.files) ? body.files : [];
  lead.files = files.filter(validFilePath).slice(0, 12);

  return { ok: Object.keys(errors).length === 0, errors, lead };
}

// A filled honeypot means 200 and nothing written: telling a bot it failed only
// teaches it what to change.
export function trapped(body) {
  return Boolean(body && typeof body === 'object' && text(body.website, 200));
}
