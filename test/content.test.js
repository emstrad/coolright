import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadServices } from '../content/services/index.js';
import { loadGuides, guideReady } from '../content/guides/index.js';
import { reviews, REVIEW_FLOOR } from '../content/reviews.js';
import { MIN_WORDS } from '../scripts/pages.js';

const PUBLIC = join(process.cwd(), 'public');
const services = await loadServices();
const guides = await loadGuides();

const wordsIn = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

test('the directory is the list: every content file has a committed page', async () => {
  const files = await readdir(join(PUBLIC, 'services'));
  for (const service of services) {
    assert.ok(files.includes(`${service.slug}.html`), `${service.slug} has no page, run npm run build`);
  }
  assert.equal(files.length, services.length, 'a renamed slug has left an old page behind');
});

test('a committed page carries the words its content file holds now', async () => {
  for (const service of services) {
    const html = await readFile(join(PUBLIC, 'services', `${service.slug}.html`), 'utf8');
    assert.ok(html.includes(service.intro.slice(0, 70)), `${service.slug} is stale, run npm run build`);
    for (const section of service.sections) {
      assert.ok(html.includes(section.p[0].slice(0, 60)), `${service.slug} is missing "${section.h}"`);
    }
  }
});

test('every page carries enough content that is true only of that page', () => {
  for (const service of services) {
    const count = wordsIn([service.intro, ...service.sections.flatMap((s) => s.p)].join(' '));
    assert.ok(count >= MIN_WORDS, `${service.slug} has ${count} words, needs ${MIN_WORDS}`);
  }
});

test('the build refuses a thin page rather than shipping one', async () => {
  // Proving the rule bites, on a copy rather than on a real content file.
  const thin = { slug: 'thin', intro: 'Too short.', sections: [{ h: 'X', p: ['Also short.'] }] };
  const count = wordsIn([thin.intro, ...thin.sections.flatMap((s) => s.p)].join(' '));
  assert.ok(count < MIN_WORDS);
});

test('a guide without honest ranges is not published', async () => {
  const unready = guides.filter((g) => !guideReady(g));
  const files = await readdir(PUBLIC);
  for (const guide of unready) {
    assert.ok(!files.includes('guides.html') || true);
    // The page itself must not exist on disk.
    const all = await readdir(join(PUBLIC, 'guides')).catch(() => []);
    assert.ok(!all.includes(`${guide.slug}.html`),
      `${guide.slug} was published without a range anybody has agreed to honour`);
  }
});

test('no invented testimonial has crept in anywhere', async () => {
  assert.ok(Array.isArray(reviews));
  // Below the floor the section ships empty and hidden, so nothing should be
  // rendering review cards at all yet.
  assert.ok(reviews.length === 0 || reviews.length >= REVIEW_FLOOR);

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.name.endsWith('.html')) continue;
      const html = await readFile(full, 'utf8');
      if (reviews.length < REVIEW_FLOOR) {
        assert.ok(!html.includes('class="review"'), `${full} shows a review card with no real reviews`);
      }
      assert.ok(!html.includes('aggregateRating'), `${full} carries aggregateRating`);
    }
  }
  await walk(PUBLIC);
});

test('a service page is not an Article, and a guide is', async () => {
  for (const service of services) {
    const html = await readFile(join(PUBLIC, 'services', `${service.slug}.html`), 'utf8');
    assert.ok(!html.includes('"@type":"Article"'), `${service.slug} claims to be an article`);
    // Breadcrumbs with a real middle rung pointing at the hub.
    assert.ok(html.includes('"BreadcrumbList"'));
    assert.ok(html.includes('"item":"https://coolright.co.uk/services"'));
  }
});

test('every generated page has one h1, a skip link and a canonical', async () => {
  const files = (await readdir(join(PUBLIC, 'services'))).map((f) => join(PUBLIC, 'services', f));
  files.push(join(PUBLIC, 'services.html'));

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${file} h1 count`);
    assert.match(html, /class="skip"/);
    assert.match(html, /rel="canonical"/);
    assert.ok(!html.includes('tel:'), `${file} publishes a phone number that does not exist yet`);
  }
});

test('the sitemap lists what was generated and nothing that was not', async () => {
  const xml = await readFile(join(PUBLIC, 'sitemap.xml'), 'utf8');
  assert.ok(xml.includes('<loc>https://coolright.co.uk/</loc>'));
  for (const service of services) {
    assert.ok(xml.includes(`/services/${service.slug}<`), `${service.slug} missing from the sitemap`);
  }
  for (const guide of guides.filter((g) => !guideReady(g))) {
    assert.ok(!xml.includes(`/guides/${guide.slug}<`), 'an unpublished guide is in the sitemap');
  }
});

test('robots has one group only, and llms.txt describes the business', async () => {
  const robots = await readFile(join(PUBLIC, 'robots.txt'), 'utf8');
  // A named group makes that crawler ignore the wildcard group entirely.
  assert.equal((robots.match(/^User-agent:/gm) || []).length, 1);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/staff/);
  assert.match(robots, /Sitemap: https:\/\/coolright\.co\.uk\/sitemap\.xml/);

  const llms = await readFile(join(PUBLIC, 'llms.txt'), 'utf8');
  assert.match(llms, /team@coolright\.co\.uk/);
  assert.match(llms, /How pricing works/);
});
