// Renders the content files into the markup the build commits.
//
// All of it ends up in the HTML on disk. Nothing here runs in the browser,
// because a section assembled from an array at runtime is a section most AI
// crawlers never see, and that is most of the words on the page.

import { services } from '../content/services.js';
import { faqs } from '../content/faqs.js';
import { business } from '../content/business.js';
import { loadServices } from '../content/services/index.js';
import { loadGuides, guideReady } from '../content/guides/index.js';

const escape = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function servicesHtml() {
  const tabs = services.map((s, i) => (
    `<button class="pill" type="button" role="tab" id="tab-${s.key}" aria-controls="panel-${s.key}" aria-selected="${i === 0}" data-svc="${s.key}">${escape(s.name)}</button>`
  )).join('\n        ');

  // Every panel is in the markup. JavaScript hides eight of them, rather than
  // creating one, so the page reads in full with scripts off or unsupported.
  const panels = services.map((s, i) => (
    `<div class="service-content" id="panel-${s.key}" role="tabpanel" aria-labelledby="tab-${s.key}"${i === 0 ? '' : ' hidden'}>
          <h3>${escape(s.name)}</h3>
          ${s.body.map((p) => `<p>${escape(p)}</p>`).join('\n          ')}
          <a href="#book" class="btn btn--primary">Get a Fixed Quote</a>
        </div>`
  )).join('\n        ');

  return `<div class="services-pills" role="tablist" aria-label="Services">
        ${tabs}
      </div>
      <div class="service-panel">
        ${panels}
        <aside class="service-aside" aria-label="What every install includes">
          <h4>Every install includes</h4>
          <ul>
            <li>A heat load calculation, so the unit matches the room rather than the budget</li>
            <li>Pressure and vacuum testing, with the commissioning readings written down</li>
            <li>Manufacturer warranty registered in your name, up to seven years</li>
            <li>Dust sheets, waste taken away, and the controls explained before we leave</li>
          </ul>
        </aside>
      </div>`;
}

export function faqHtml() {
  return `<div class="faq-list">
        ${faqs.map((f) => (
    `<details class="qa">
          <summary>${escape(f.q)}<span class="qa-plus" aria-hidden="true"></span></summary>
          <p>${escape(f.a)}</p>
        </details>`
  )).join('\n        ')}
      </div>`;
}

export function schemaHtml() {
  const local = {
    '@context': 'https://schema.org',
    '@type': business.schemaType,
    name: business.name,
    slogan: business.slogan,
    description: `Air conditioning, heating and ventilation installation, servicing and maintenance across ${business.regionLong}.`,
    email: business.email,
    url: business.domain,
    address: { '@type': 'PostalAddress', addressRegion: 'Greater London', addressCountry: 'GB' },
    areaServed: business.counties,
    serviceType: services.map((s) => s.name),
  };

  // Omitted rather than guessed. sameAs is the signal that ties this site to
  // the map listing, and a wrong one is worse than none.
  if (business.phone) local.telephone = business.phone;
  if (business.googleBusinessProfile) local.sameAs = [business.googleBusinessProfile];

  // No aggregateRating, ever. Google's review snippet guidelines exclude
  // ratings aggregated from another site, so marking up a Google score to win
  // stars in Google's own results is not eligible and risks a manual action.

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return [local, faqPage]
    .map((block) => `<script type="application/ld+json">\n${JSON.stringify(block, null, 0)}\n</script>`)
    .join('\n');
}

// The footer link block, built from the pages that actually exist. A page
// nothing links to is a page Google treats as unimportant, and a link to a page
// the build refused to write is a 404.
export async function linksHtml() {
  const services = await loadServices();
  const guides = (await loadGuides()).filter(guideReady);

  const items = services.map((s) => (
    `<li><a href="/services/${s.slug}">${escape(s.name)}</a></li>`
  )).concat(guides.map((g) => (
    `<li><a href="/guides/${g.slug}">${escape(g.name)}</a></li>`
  )));

  return `<ul class="footer-links">
          ${items.join('\n          ')}
        </ul>`;
}
