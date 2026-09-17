// House rule, enforced rather than hoped for: no em dashes anywhere in the
// repo. CI fails on a hit so one never reaches a page.
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['.git', 'node_modules', '.vercel', 'coverage']);
const EXT = new Set(['.js', '.mjs', '.html', '.css', '.md', '.json', '.sql', '.txt', '.yml', '.yaml']);

// Built from its code point rather than typed, so this file does not trip its
// own check.
const EM_DASH = String.fromCharCode(0x2014);

const hits = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!EXT.has(extname(entry.name))) continue;
    const text = await readFile(full, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (line.includes(EM_DASH)) hits.push(`${full.replace(`${ROOT}/`, '')}:${i + 1}`);
    });
  }
}

await walk(ROOT);

if (hits.length) {
  console.error('Em dash found:');
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log('No em dashes.');
