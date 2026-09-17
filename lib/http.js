// Small helpers shared by every function under api/.
import { createHash } from 'node:crypto';

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Belt and braces alongside the vercel.json header: an API answer that gets
  // cached is an API answer served to the wrong visitor. A route that has
  // deliberately set its own caching (the reviews and address lookups, which
  // hold nothing personal) keeps it.
  if (!res.getHeader?.('Cache-Control') && !res.headers?.['cache-control']) {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  json(res, 405, { error: 'method_not_allowed' });
  return false;
}

// There is no Access-Control-Allow-Origin header anywhere in this app, so a
// cross-origin browser fetch cannot read a response. This adds the write-side
// half: a request declaring a foreign Origin is refused outright.
export function requireSameOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form posts and server checks omit it
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    if (new URL(origin).host === host) return true;
  } catch {
    // An unparseable Origin is not a same-origin request.
  }
  json(res, 403, { error: 'bad_origin' });
  return false;
}

// Reads the action segment out of a bracketed dynamic route, so several related
// endpoints share one file and the deployment stays under the twelve function
// ceiling a Hobby plan allows.
export function actionFrom(req, name = 'action') {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : str(value);
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

// The raw address is never stored. Without IP_SALT a sha256 of an IPv4 is
// brute-forced in seconds and the promise would not hold, so refuse to pretend.
export function ipHash(ip) {
  const salt = process.env.IP_SALT;
  if (!salt || !ip) return null;
  return createHash('sha256').update(`${ip}${salt}`).digest('hex');
}

export function str(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export async function readText(req, limit = 1024 * 512) {
  if (typeof req.body === 'string') return req.body;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Raw bytes, for the proxied upload path. Capped well under the 4MB a Vercel
// function will carry, so an oversized body is refused before it is buffered.
export async function readBuffer(req, limit = 4 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  // Vercel parses JSON bodies for us when the content type says so, but the
  // tests drive the handlers with a plain stream, so handle both.
  if (req.body && typeof req.body === 'object') return req.body;
  const text = await readText(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
