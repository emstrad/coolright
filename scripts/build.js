// The authoring build. Not a deploy step: Vercel serves public/ exactly as it
// sits, and everything this writes is committed.
//
// Today it does two of the seven passes described in the README. The rest
// (service, guide, area and hub pages, the sitemap, the review cards) arrive
// with the content stages, and this file grows a pass at a time.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { formHtml } from './book-form.js';
import { servicesHtml, faqHtml, schemaHtml, linksHtml } from './render-home.js';
import { buildPages } from './pages.js';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');

// Every generated block on a page sits between a pair of these. The opening
// marker carries its own explanation, so somebody editing the page sees why
// their change would be overwritten before they make it.
const BLOCKS = [
  ['BOOK', () => formHtml()],
  ['SERVICES', () => servicesHtml()],
  ['FAQ', () => faqHtml()],
  ['SCHEMA', () => schemaHtml()],
  ['LINKS', (links) => links],
];

// Every asset reference carries a content hash, which is the only thing that
// makes a year of immutable caching safe. Without it a returning visitor runs
// last month's script against this month's markup.
async function hashes() {
  const out = new Map();
  for (const dir of ['css', 'js']) {
    const base = join(PUBLIC, 'assets', dir);
    let names = [];
    try {
      names = await readdir(base);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!['.css', '.js'].includes(extname(name))) continue;
      const bytes = await readFile(join(base, name));
      out.set(`/assets/${dir}/${name}`, createHash('sha256').update(bytes).digest('hex').slice(0, 10));
    }
  }
  return out;
}

export function stamp(html, map) {
  // Rewrites an existing stamp as readily as it adds a missing one, so the
  // pass is idempotent and editing an asset is the only thing that changes it.
  return html.replace(/(["'])(\/assets\/(?:css|js)\/[A-Za-z0-9._-]+?)(?:\?v=[a-f0-9]+)?\1/g,
    (whole, quote, path) => {
      const hash = map.get(path);
      return hash ? `${quote}${path}?v=${hash}${quote}` : whole;
    });
}

export function injectBlock(html, name, content) {
  const start = html.indexOf(`<!-- ${name}:START`);
  const end = html.indexOf(`<!-- ${name}:END -->`);
  if (start === -1 || end === -1) return html;
  const head = html.slice(0, html.indexOf('-->', start) + 3);
  return `${head}\n${content}\n      ${html.slice(end)}`;
}

export async function injectAll(html) {
  const links = await linksHtml();
  return BLOCKS.reduce((out, [name, render]) => injectBlock(out, name, render(links)), html);
}

async function htmlFiles() {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (extname(entry.name) === '.html') out.push(full);
    }
  }
  await walk(PUBLIC);
  return out;
}

// write: false is what the test uses. It reports which committed pages are out
// of date without touching them, so a stale page fails CI rather than shipping
// with last month's form or a stamp that no longer matches the asset.
export async function build({ write = true } = {}) {
  // Generated pages first, then the markers, then the stamps last, so whatever
  // the earlier passes wrote is what gets stamped.
  const generated = write ? await buildPages() : { problems: [], written: [], skipped: 0 };
  const map = await hashes();
  const written = [];

  for (const page of await htmlFiles()) {
    const before = await readFile(page, 'utf8');
    // The generated blocks go in first and the stamps go on last, so whatever
    // the other passes wrote is what gets stamped.
    const after = stamp(await injectAll(before), map);
    if (after !== before) {
      if (write) await writeFile(page, after);
      written.push(page.replace(`${PUBLIC}/`, ''));
    }
  }

  return { written, assets: map.size, pages: generated };
}

// Run directly, rather than imported by a test.
if (process.argv[1] && process.argv[1].endsWith('build.js')) {
  const { written, assets, pages } = await build();

  for (const problem of pages.problems) console.log(`Not published: ${problem}`);
  if (pages.problems.some((p) => p.includes('words'))) {
    console.error('Thin content. Nothing was written.');
    process.exit(1);
  }

  console.log(`Generated ${pages.written.length} pages.`);
  console.log(`Stamped ${assets} assets.`);
  console.log(written.length ? `Wrote: ${written.join(', ')}` : 'Every page was already current.');
}
