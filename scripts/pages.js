// Generates the service, guide and hub pages, and the sitemap.
//
// The build checks every content file first and refuses to write anything if
// any of them fails. A thin page drags the whole site down rather than just
// itself, so it is better to ship nothing than to ship one.
import { writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadServices } from '../content/services/index.js';
import { loadGuides, guideReady } from '../content/guides/index.js';
import { hubs } from '../content/hubs.js';
import { business } from '../content/business.js';
import { formHtml } from './book-form.js';
import { headerHtml, actionBarHtml } from './chrome.js';

const PUBLIC = join(process.cwd(), 'public');
const MIN_WORDS = 250;

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

// hasGuides decides whether the guides hub is linked at all. Linking a hub the
// build refused to write would be a 404 in the primary nav, which is worse than
// no link.
function shell({ title, description, path, h1, breadcrumb, body, schema, hasGuides }) {
  const url = `${business.domain}${path}`;
  return `<!DOCTYPE html>
<html lang="en-GB" class="no-js">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<meta name="theme-color" content="#0F172A" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="en_GB" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${url}" />
<link rel="preload" href="/assets/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/assets/css/site.css" />
<link rel="stylesheet" href="/assets/css/sections.css" />
<link rel="stylesheet" href="/assets/css/pages.css" />
<link rel="stylesheet" href="/assets/css/form.css" />
<script type="application/ld+json">
${JSON.stringify(breadcrumb)}
</script>${schema ? `\n<script type="application/ld+json">\n${JSON.stringify(schema)}\n</script>` : ''}
<script>document.documentElement.classList.remove('no-js')</script>
</head>
<body>

<a class="skip" href="#main">Skip to content</a>

<header class="site-header" id="site-header">
  ${headerHtml({ hasGuides, onHome: false })}
</header>

<main id="main">
  <article class="page">
    <div class="container">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a> <span aria-hidden="true">/</span>
        ${breadcrumb.itemListElement.length > 2
    ? `<a href="${breadcrumb.itemListElement[1].item}">${escape(breadcrumb.itemListElement[1].name)}</a> <span aria-hidden="true">/</span> ` : ''}
        <span>${escape(h1)}</span>
      </nav>
      <h1>${escape(h1)}</h1>
${body}
    </div>
  </article>

  <section class="panel">
    <div class="container">
${formHtml()}
    </div>
  </section>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer-bar">
      <span>&copy; 2026 CoolRight</span>
      <span>${escape(business.regionLong)}</span>
      <span><a href="/services">Services</a></span>
      ${hasGuides ? '<span><a href="/guides">Cost guides</a></span>' : ''}
      <span><a href="/staff">Staff login</a></span>
    </div>
  </div>
</footer>

${actionBarHtml()}

<script src="/assets/js/visit.js"></script>
<script src="/assets/js/partial.js"></script>
<script src="/assets/js/book.js"></script>
<script src="/assets/js/menu.js" defer></script>
<script src="/assets/js/address.js" defer></script>
<script src="/assets/js/upload.js" defer></script>

</body>
</html>
`;
}

function crumb(parent, name, path) {
  const items = [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${business.domain}/` }];
  // A real middle rung pointing at the hub, rather than a two step trail that
  // tells a crawler the page hangs off nothing.
  if (parent) items.push({ '@type': 'ListItem', position: 2, name: parent.name, item: `${business.domain}${parent.path}` });
  items.push({ '@type': 'ListItem', position: items.length + 1, name, item: `${business.domain}${path}` });
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}

function serviceBody(service, guide) {
  const sections = service.sections.map((s) => (
    `      <h2>${escape(s.h)}</h2>\n${s.p.map((p) => `      <p>${escape(p)}</p>`).join('\n')}`
  )).join('\n');

  return `      <p class="lede">${escape(service.intro)}</p>
${sections}
${guide ? `      <p class="guide-link"><a href="/guides/${guide.slug}">Read the cost guide: ${escape(guide.name)}</a></p>` : ''}`;
}

function guideBody(guide) {
  const ranges = guide.ranges.map((r) => (
    `        <li><strong>${escape(r.what)}</strong><span>£${r.from.toLocaleString('en-GB')} to £${r.to.toLocaleString('en-GB')}</span></li>`
  )).join('\n');

  return `      <p class="lede">${escape(guide.caveat)}</p>
      <ul class="ranges">
${ranges}
      </ul>
      <h2>What moves the number</h2>
${guide.movers.map((m) => `      <h3>${escape(m.h)}</h3>\n      <p>${escape(m.p)}</p>`).join('\n')}
      <h2>When you do not need the work at all</h2>
      <ul>
${guide.notNeeded.map((n) => `        <li>${escape(n)}</li>`).join('\n')}
      </ul>
      <h2>What a fair quote should state</h2>
      <ul>
${guide.fairQuote.map((n) => `        <li>${escape(n)}</li>`).join('\n')}
      </ul>
      <h2>What is never added afterwards</h2>
      <p>${escape(guide.neverAdded)}</p>`;
}

function hubBody(hub, children, base) {
  return `${hub.intro.map((p) => `      <p class="lede">${escape(p)}</p>`).join('\n')}
      <div class="cards">
${children.map((c) => `        <article class="card"><h2><a href="${base}/${c.slug}">${escape(c.name)}</a></h2><p>${escape(c.description)}</p></article>`).join('\n')}
      </div>`;
}

export async function buildPages() {
  const services = await loadServices();
  const guides = await loadGuides();
  const problems = [];

  for (const service of services) {
    const count = words([service.intro, ...service.sections.flatMap((s) => s.p)].join(' '));
    if (count < MIN_WORDS) problems.push(`services/${service.slug}: ${count} words, needs ${MIN_WORDS}`);
  }

  const ready = [];
  for (const guide of guides) {
    if (!guideReady(guide)) {
      problems.push(`guides/${guide.slug}: no honest ranges yet, so it is not published`);
      continue;
    }
    ready.push(guide);
  }

  // Every problem is printed and nothing is written. A half-written set of
  // pages is worse than none, because the sitemap would then disagree with
  // what is on disk.
  const fatal = problems.filter((p) => p.includes('words'));
  if (fatal.length) return { problems, written: [], skipped: [] };

  // Cleared and rewritten, so a renamed slug does not leave the old page live
  // for ever.
  for (const dir of ['services', 'guides']) {
    await rm(join(PUBLIC, dir), { recursive: true, force: true });
    await mkdir(join(PUBLIC, dir), { recursive: true });
  }

  const written = [];
  const servicesHub = { name: 'Services', path: '/services' };
  const guidesHub = { name: 'Cost guides', path: '/guides' };

  for (const service of services) {
    const guide = ready.find((g) => g.service === service.slug);
    const path = `/services/${service.slug}`;
    await writeFile(join(PUBLIC, `services/${service.slug}.html`), shell({
      hasGuides: ready.length > 0,
      title: service.title,
      description: service.description,
      path,
      h1: service.h1,
      breadcrumb: crumb(servicesHub, service.name, path),
      body: serviceBody(service, guide),
    }));
    written.push(path);
  }

  for (const guide of ready) {
    const path = `/guides/${guide.slug}`;
    await writeFile(join(PUBLIC, `guides/${guide.slug}.html`), shell({
      hasGuides: true,
      title: guide.title,
      description: guide.description,
      path,
      h1: guide.h1,
      breadcrumb: crumb(guidesHub, guide.name, path),
      // A guide is an article. A service page is not, so only this one carries
      // Article, with a real publication date.
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: guide.h1,
        datePublished: guide.published,
        author: { '@type': 'Organization', name: business.name },
        publisher: { '@type': 'Organization', name: business.name },
        mainEntityOfPage: `${business.domain}${path}`,
      },
      body: guideBody(guide),
    }));
    written.push(path);
  }

  await writeFile(join(PUBLIC, 'services.html'), shell({
    hasGuides: ready.length > 0,
    title: hubs.services.title,
    description: hubs.services.description,
    path: '/services',
    h1: hubs.services.h1,
    breadcrumb: crumb(null, 'Services', '/services'),
    body: hubBody(hubs.services, services, '/services'),
  }));
  written.push('/services');

  if (ready.length) {
    await writeFile(join(PUBLIC, 'guides.html'), shell({
      hasGuides: true,
      title: hubs.guides.title,
      description: hubs.guides.description,
      path: '/guides',
      h1: hubs.guides.h1,
      breadcrumb: crumb(null, 'Cost guides', '/guides'),
      body: hubBody(hubs.guides, ready, '/guides'),
    }));
    written.push('/guides');
  }

  // The sitemap is written from what was just generated, so adding a page
  // cannot leave something that nothing links to and nothing lists.
  const urls = ['/', ...written.filter((p, i, a) => a.indexOf(p) === i)];
  await writeFile(join(PUBLIC, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map((u) => `  <url><loc>${business.domain}${u}</loc></url>`).join('\n')}\n</urlset>\n`);

  return { problems, written, skipped: guides.length - ready.length };
}

export { MIN_WORDS };
