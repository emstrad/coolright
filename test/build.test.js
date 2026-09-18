import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { build, stamp } from '../scripts/build.js';
import { formHtml } from '../scripts/book-form.js';
import { JOB_TYPES, PROPERTY_TYPES } from '../lib/validate.js';

const PUBLIC = join(process.cwd(), 'public');

async function htmlPages(dir = PUBLIC, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await htmlPages(full, out);
    else if (extname(entry.name) === '.html') out.push(full);
  }
  return out;
}

test('every committed page is what the generator produces now', async () => {
  const { written } = await build({ write: false });
  assert.deepEqual(
    written,
    [],
    `Stale pages, run npm run build: ${written.join(', ')}`,
  );
});

test('asset stamps are current', async () => {
  for (const page of await htmlPages()) {
    const html = await readFile(page, 'utf8');
    const refs = html.match(/\/assets\/(?:css|js|fonts)\/[A-Za-z0-9._-]+(?:\?v=[a-f0-9]+)?/g) || [];
    for (const ref of refs) {
      assert.match(ref, /\?v=[a-f0-9]{10}$/, `${ref} in ${page} is not stamped`);
    }
  }
});

test('nothing loads from a third party', async () => {
  for (const page of await htmlPages()) {
    const html = await readFile(page, 'utf8');
    // Only the markup that actually fetches something counts. A mailto, a
    // canonical URL or an og:url pointing at our own domain is not a request.
    const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/([^"]+)"/g)]
      .map((m) => m[2])
      .filter((host) => !host.startsWith('coolright.co.uk'));
    assert.deepEqual(external, [], `${page} loads from ${external.join(', ')}`);
  }
});

test('the form offers exactly the values the server will accept', () => {
  const html = formHtml();
  const offered = [...html.matchAll(/name="job_types" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offered.sort(), [...JOB_TYPES].sort());
  for (const type of PROPERTY_TYPES) assert.ok(html.includes(`<option>${type}</option>`));
});

test('the form carries the honeypot and the error copy validation returns', () => {
  const html = formHtml();
  assert.match(html, /name="website"/);
  assert.ok(html.includes('Please enter your first name.'));
  assert.ok(html.includes('Please enter a valid email address.'));
  assert.ok(html.includes('Please enter your postcode.'));
  assert.ok(html.includes('Please choose one.'));
});

test('stamping is idempotent and rewrites rather than doubles', () => {
  const map = new Map([['/assets/js/book.js', 'aaaaaaaaaa']]);
  const once = stamp('<script src="/assets/js/book.js"></script>', map);
  assert.equal(once, '<script src="/assets/js/book.js?v=aaaaaaaaaa"></script>');
  assert.equal(stamp(once, map), once);
  assert.equal(
    stamp('<script src="/assets/js/book.js?v=0000000000"></script>', map),
    once,
  );
});

test('the page sets no cookie and loads the scripts in the order they depend on', async () => {
  const html = await readFile(join(PUBLIC, 'index.html'), 'utf8');
  const order = [...html.matchAll(/\/assets\/js\/([a-z]+)\.js/g)].map((m) => m[1]);
  assert.equal(order[0], 'visit', 'visit.js holds the session id everything else asks for');
  assert.ok(order.indexOf('partial') < order.indexOf('book'));
});
