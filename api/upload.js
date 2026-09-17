// POST /api/upload
//
// Two modes, because the bytes are better off never entering a function:
//   ?mode=ticket  issues a short-lived token and the URL to PUT straight to
//                 blob storage, which has no meaningful size limit;
//   ?mode=proxy   carries the bytes through, which tops out near 4MB because
//                 Vercel will not take a larger body into a function.
//
// The client tries the ticket first and falls back, so a store that is not
// configured yet degrades to the smaller path rather than losing the photo.
import { put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { json, requireMethod, requireSameOrigin, readJson, readBuffer, clientIp, ipHash, str } from '../lib/http.js';
import { validFilePath } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';

const BLOB_HOST = 'https://blob.vercel-storage.com';
const TICKET_MS = 10 * 60 * 1000;

function safeName(name) {
  const clean = str(name, 140).replace(/[^A-Za-z0-9._-]/g, '-');
  return clean || 'file';
}

function pathFor(sessionId, name) {
  const path = `leads/${sessionId}/${Date.now()}-${safeName(name)}`;
  // Checked against the same rule the lead endpoint applies, so a path this
  // route hands out can never be one the lead endpoint would reject.
  return validFilePath(path) ? path : null;
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  // Attachments are optional. Without a store the form still sends, and the
  // visitor is told on the confirmation rather than blocked at the field.
  if (!token) return json(res, 503, { error: 'uploads_unavailable' });

  const hash = ipHash(clientIp(req));
  const throttle = await limit({ bucket: 'upload', key: hash, windowSeconds: 600, max: 40, failOpen: true });
  if (!throttle.allowed) return json(res, 429, { error: 'rate_limited' });

  const mode = req.query?.mode === 'proxy' ? 'proxy' : 'ticket';

  if (mode === 'ticket') {
    const body = await readJson(req);
    if (body === null) return json(res, 400, { error: 'bad_json' });
    const sessionId = str(body.session_id, 64);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json(res, 400, { error: 'invalid' });

    const path = pathFor(sessionId, body.name);
    if (!path) return json(res, 400, { error: 'invalid_name' });

    // The token is scoped to this one pathname and expires in ten minutes, so
    // it cannot be reused to write anywhere else in the store.
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname: path,
      validUntil: Date.now() + TICKET_MS,
      allowOverwrite: false,
      onUploadCompleted: undefined,
    });

    return json(res, 200, {
      url: `${BLOB_HOST}/${path}`,
      token: clientToken,
      path,
      apiVersion: 7,
    });
  }

  const sessionId = str(req.query?.session_id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json(res, 400, { error: 'invalid' });
  const path = pathFor(sessionId, req.query?.name);
  if (!path) return json(res, 400, { error: 'invalid_name' });

  try {
    const bytes = await readBuffer(req);
    if (!bytes.length) return json(res, 400, { error: 'empty' });
    await put(path, bytes, {
      access: 'public',
      token,
      contentType: str(req.headers['content-type'], 100) || 'application/octet-stream',
      // The path carries a random session id and a timestamp, so it is not
      // guessable, and the staff area serves it through an authenticated route
      // rather than linking the store URL.
      addRandomSuffix: false,
    });
    return json(res, 200, { path });
  } catch (err) {
    if (err.message === 'body_too_large') return json(res, 413, { error: 'too_large' });
    console.error('upload_failed', err);
    return json(res, 500, { error: 'upload_failed' });
  }
}

export const config = { api: { bodyParser: false } };
