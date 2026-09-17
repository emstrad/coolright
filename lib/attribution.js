// Channel and device are worked out here, on the server, and never accepted
// from the client. A field the browser can set is a field a bot can set, and
// the whole point of these two columns is deciding where the money goes.

const SEARCH = ['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'brave', 'yandex'];
const SOCIAL = ['facebook', 'instagram', 'linkedin', 'x', 'twitter', 'tiktok', 'youtube', 'pinterest', 'nextdoor', 'reddit'];
const EMAIL = ['mail.google.com', 'outlook', 'mail.yahoo', 'webmail', 'mail.', 'zoho'];
const DIRECTORY = ['checkatrade', 'trustatrader', 'mybuilder', 'ratedpeople', 'yell', 'bark', 'houzz', 'which.co.uk'];

// Known campaign keys only. Anything else is somebody else's parameter, or
// somebody probing, and neither belongs in the column the reports read.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid'];

export function hostOf(referrer) {
  if (typeof referrer !== 'string' || !referrer) return '';
  try {
    return new URL(referrer).host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// Matches on label boundaries rather than bare substrings, so "notgoogle.com"
// is not search and "mygoogleshop.co.uk" is not either.
function hasLabel(host, needle) {
  if (needle.includes('.')) return host === needle || host.endsWith(`.${needle}`) || host.startsWith(needle);
  return host.split('.').includes(needle);
}

export function channelFrom({ referrer = '', utm = {}, host = null } = {}) {
  const source = (utm.utm_source || '').toLowerCase();
  const medium = (utm.utm_medium || '').toLowerCase();

  if (utm.gclid || utm.msclkid || medium === 'cpc' || medium === 'ppc' || medium === 'paid') return 'paid';
  if (utm.fbclid || medium === 'paid_social') return 'paid';
  if (medium === 'email' || source === 'email' || source === 'newsletter') return 'email';

  const h = host === null ? hostOf(referrer) : host;
  if (!h) return utm.utm_source ? 'campaign' : 'direct';

  // Webmail is tested before search on purpose: mail.google.com is an email
  // click, and it contains "google".
  if (EMAIL.some((n) => hasLabel(h, n) || h.startsWith(n))) return 'email';
  if (DIRECTORY.some((n) => hasLabel(h, n))) return 'directory';
  if (SEARCH.some((n) => hasLabel(h, n))) return 'organic';
  if (SOCIAL.some((n) => hasLabel(h, n))) return 'social';
  return 'referral';
}

export function deviceFrom(userAgent = '') {
  const ua = String(userAgent).toLowerCase();
  if (!ua) return 'unknown';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

export function cleanUtm(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of UTM_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 120);
  }
  return out;
}

// One call, so every write records the same derived set.
export function attribute({ referrer = '', utm = {}, userAgent = '' } = {}) {
  const clean = cleanUtm(utm);
  const host = hostOf(referrer);
  return {
    channel: channelFrom({ referrer, utm: clean, host }),
    referrer_host: host || null,
    device: deviceFrom(userAgent),
    utm: clean,
  };
}
