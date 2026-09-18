// The staff session cookie.
//
// Signed rather than encrypted: it holds nothing secret, and the signature is
// there to stop it being edited. Verified in constant time, because a timing
// difference on a comparison is a real way to forge one a byte at a time.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const COOKIE = 'cr_staff';
const MAX_AGE = 8 * 60 * 60; // eight hours, about a working day

function secret() {
  const value = process.env.SESSION_SECRET;
  // Refused rather than defaulted. A signing key with a fallback is not a
  // signing key, and rotating it is supposed to sign everyone out.
  if (!value) throw new Error('SESSION_SECRET is not set');
  return value;
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issue(who = 'staff') {
  const body = Buffer.from(JSON.stringify({
    who,
    id: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  let expected;
  try {
    expected = sign(body);
  } catch {
    return null;
  }

  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

export function cookieHeader(token) {
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${token ? MAX_AGE : 0}`,
  ];
  return parts.join('; ');
}

export function readCookie(req) {
  const header = req.headers?.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return '';
}

export function session(req) {
  return verify(readCookie(req));
}

// Every /api/admin route calls this first.
export function requireAuth(req, res) {
  const who = session(req);
  if (who) return who;
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: 'unauthorised' }));
  return null;
}
