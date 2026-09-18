// The directory is the list.
//
// This reads its own folder, so there is no register to update and no way to
// write a page and leave it unpublished by forgetting to add it somewhere.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export async function loadServices() {
  const files = readdirSync(here)
    .filter((name) => name.endsWith('.js') && name !== 'index.js')
    .sort();

  const pages = [];
  for (const file of files) {
    const mod = await import(join(here, file));
    const page = mod.page;
    if (!page) throw new Error(`content/services/${file} has no page export`);
    pages.push({ ...page, slug: page.slug || file.replace(/\.js$/, '') });
  }
  return pages;
}
