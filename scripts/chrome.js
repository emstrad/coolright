// The header and the mobile action bar, in one place.
//
// The home page and every generated page carry the same chrome. Writing it
// twice is how the two drift, which is the same reason the quote form is
// generated rather than hand-written.
//
// The shape follows the house pattern used across these sites: brand with its
// tagline on the left, a hamburger labelled "Menu", and the way to contact the
// business on the right, all on one row. The primary call to action is not in
// the mobile header at all: it lives in the fixed bar at the bottom of the
// screen, where a thumb is.
import { business } from '../content/business.js';

// Where the phone number would go once there is one. Until then the email
// takes that slot, because a placeholder number rings somebody else.
function contact() {
  if (business.phoneDisplay) {
    return `<a href="tel:${business.phone}" class="call-link" data-placement="header">
          <span class="contact-full">${business.phoneDisplay}</span>
          <span class="contact-short">Call</span>
        </a>`;
  }
  return `<a href="mailto:${business.email}" class="call-link">
          <span class="contact-full">${business.email}</span>
          <span class="contact-short">Email</span>
        </a>`;
}

export function headerHtml({ hasGuides = false, onHome = true } = {}) {
  const at = (hash) => (onHome ? `#${hash}` : `/#${hash}`);

  return `<div class="container nav">
    <a href="/" class="brand" aria-label="CoolRight home">
      <span class="wordmark">Cool<span class="r">Right</span></span>
      <span class="tagline">Climate control. Done <span class="r">right.</span></span>
    </a>
    <div class="nav-end">
      <nav aria-label="Primary" id="nav-panel">
        <ul class="nav-links">
          <li><a href="${at('how')}">How It Works</a></li>
          <li><a href="/services">Services</a></li>
          ${hasGuides ? '<li><a href="/guides">Cost Guides</a></li>' : ''}
          <li><a href="${at('commercial')}">Commercial</a></li>
          <li><a href="${at('areas')}">Areas</a></li>
          <li><a href="${at('faq')}">FAQs</a></li>
        </ul>
      </nav>
      <button class="nav-toggle" type="button" id="nav-toggle" aria-expanded="false" aria-controls="nav-panel">
        <span class="bars" aria-hidden="true"></span>
        <span class="menu-label">Menu</span>
      </button>
      <div class="nav-cta">
        ${contact()}
        <a href="#book" class="btn btn--primary">Get a Fixed Quote</a>
      </div>
    </div>
  </div>`;
}

// Two buttons, the way the rest of these sites do it: a quiet way to make
// contact, and the one thing the page is for.
export function actionBarHtml() {
  const first = business.phoneDisplay
    ? `<a href="tel:${business.phone}" class="btn btn--ghost" data-placement="action-bar">Call Now</a>`
    : `<a href="mailto:${business.email}" class="btn btn--ghost">Email Us</a>`;

  return `<div class="action-bar" role="group" aria-label="Quick actions">
  ${first}
  <a href="#book" class="btn btn--primary" data-focus-form>Get a Fixed Quote</a>
</div>`;
}
