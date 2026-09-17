/* Visit identity and first-party attribution. Loaded first, because every other
   script on the page asks it for the session id.

   No cookie is set here and nothing is shared with a third party. The id lives
   in sessionStorage, which means it dies with the tab, does not follow anyone
   between sites, and cannot be read by anything but this origin. */
(function () {
  'use strict';

  var KEY = 'cr_visit';
  var store = null;
  try {
    store = window.sessionStorage;
  } catch (e) {
    // Private mode, or storage blocked. The form still works; the visit just
    // is not stitched together afterwards. That trade is the right way round.
    store = null;
  }

  function id() {
    var bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues
      ? window.crypto.getRandomValues(bytes)
      : bytes.forEach(function (_, i) { bytes[i] = Math.floor(Math.random() * 256); });
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }

  function params() {
    var out = {};
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid'];
    var search = new URLSearchParams(window.location.search);
    keys.forEach(function (key) {
      var value = search.get(key);
      if (value) out[key] = value.slice(0, 120);
    });
    return out;
  }

  function read() {
    if (!store) return null;
    try {
      return JSON.parse(store.getItem(KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  // Captured once per visit. The referrer on the third page of a visit is this
  // site, so recording it per page would credit every enquiry to itself.
  var visit = read();
  if (!visit || !visit.session_id) {
    visit = {
      session_id: id(),
      referrer: document.referrer || '',
      utm: params(),
      landing_path: window.location.pathname || '/',
    };
    if (store) {
      try { store.setItem(KEY, JSON.stringify(visit)); } catch (e) { /* full or blocked */ }
    }
  }

  function post(path, payload, beacon) {
    var body = JSON.stringify(payload);
    // sendBeacon survives the page going away, which is exactly when the last
    // and most interesting events fire.
    if (beacon && navigator.sendBeacon) {
      try {
        return navigator.sendBeacon(path, new Blob([body], { type: 'application/json' }));
      } catch (e) { /* fall through to fetch */ }
    }
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
    }).catch(function () {
      // An event that fails to record is a gap in a report. It is never
      // something the visitor should be told about.
    });
  }

  function track(type, detail, beacon) {
    return post('/api/event', {
      session_id: visit.session_id,
      type: type,
      detail: detail || {},
      path: window.location.pathname,
      referrer: visit.referrer,
      utm: visit.utm,
    }, beacon);
  }

  window.CR = {
    visit: visit,
    track: track,
    post: post,
  };

  track('page_view', {});

  // Call placement matters: the header, the mobile action bar and the closing
  // CTA convert very differently, and the dashboard breaks the log down by it.
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
    if (!link) return;
    track('call_click', { placement: link.getAttribute('data-placement') || 'unknown' }, true);
  });
}());
