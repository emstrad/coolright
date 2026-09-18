// Cost guides. One per major service.
//
// You cannot publish a price list, and that does not let you off answering the
// price question. The highest-intent searches in this trade are cost questions,
// and almost no competitor answers them, so these pages are worth more than any
// other page on the site.
//
// They are worth exactly nothing the first time a reader finds the real quote
// is double the page. So a guide whose `ranges` are still null is refused by
// the build rather than published with a number somebody invented.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export async function loadGuides() {
  const files = readdirSync(here)
    .filter((name) => name.endsWith('.js') && name !== 'index.js')
    .sort();

  const pages = [];
  for (const file of files) {
    const mod = await import(join(here, file));
    const page = mod.page;
    if (!page) throw new Error(`content/guides/${file} has no page export`);
    pages.push({ ...page, slug: page.slug || file.replace(/\.js$/, '') });
  }
  return pages;
}

// A guide is publishable only when every range it quotes is a real figure the
// business will honour.
export function guideReady(guide) {
  if (!Array.isArray(guide.ranges) || !guide.ranges.length) return false;
  return guide.ranges.every((r) => r && typeof r.from === 'number' && typeof r.to === 'number');
}
