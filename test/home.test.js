import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { services } from '../content/services.js';
import { faqs } from '../content/faqs.js';

const page = await readFile(join(process.cwd(), 'public', 'index.html'), 'utf8');
const text = page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');

test('every word is in the markup, not built by a script at runtime', () => {
  // Most AI crawlers do not run JavaScript. In the original build this was
  // roughly 1,450 words per page that they never saw.
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words > 1200, `only ${words} words are in the markup`);

  for (const service of services) {
    assert.ok(page.includes(service.body[0].slice(0, 60)), `${service.name} is missing`);
  }
  for (const faq of faqs) {
    assert.ok(page.includes(faq.q), `${faq.q} is missing`);
  }
});

test('one h1, one main landmark, and headings that never skip a level', () => {
  assert.equal((page.match(/<h1[\s>]/g) || []).length, 1);
  assert.equal((page.match(/<main[\s>]/g) || []).length, 1);
  assert.match(page, /class="skip"/);

  const levels = [...page.matchAll(/<h([1-4])[\s>]/g)].map((m) => Number(m[1]));
  let previous = 0;
  for (const level of levels) {
    assert.ok(level <= previous + 1, `heading jumped from h${previous} to h${level}`);
    previous = level;
  }
});

test('no star average, review count or unheld accreditation has crept in', () => {
  // Google's review snippet guidelines exclude ratings aggregated from another
  // site, so marking one up is not eligible and risks a manual action.
  assert.ok(!page.includes('aggregateRating'));
  assert.doesNotMatch(text, /\b\d(\.\d)?\s*(out of 5|stars|\/\s*5)\b/i);
  assert.doesNotMatch(text, /\b\d+\s+(reviews|five star)\b/i);

  // Only accreditations the business actually holds.
  for (const claim of ['NICEIC', 'TrustMark', 'Which? Trusted', 'Gas Safe', 'REFCOM']) {
    assert.ok(!page.includes(claim), `${claim} is claimed but not held`);
  }
});

test('no phone number is published until there is one to publish', () => {
  assert.ok(!page.includes('tel:'), 'a tel: link is live without a confirmed number');
  assert.ok(!page.includes('01234 567890'), 'the design mock placeholder number is live');
});

test('the structured data matches what the page shows', () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((m) => JSON.parse(m[1]));

  const local = blocks.find((b) => b['@type'] === 'HVACBusiness');
  assert.ok(local, 'the business schema is missing');
  assert.equal(local.email, 'team@coolright.co.uk');
  // Omitted rather than guessed, until the listing and the number exist.
  assert.equal(local.sameAs, undefined);
  assert.equal(local.telephone, undefined);

  const faqPage = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.equal(faqPage.mainEntity.length, faqs.length);
  for (const entry of faqPage.mainEntity) {
    assert.ok(page.includes(entry.name), 'the schema asks a question the page does not');
  }
});
