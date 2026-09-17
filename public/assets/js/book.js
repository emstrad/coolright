/* The quote request form: steps, validation, submit.

   On submit, in this order: store the lead and get an id back, then post the
   email relay from the browser, then report the outcome to /api/notified.
   FormSubmit and most relays sit behind Cloudflare, which answers a
   server-to-server request with a bot challenge and a 403 rather than sending
   anything. Posting from the browser means a blocked or ad-blocked visitor
   costs the email and never the enquiry, and the dashboard shows which of the
   two happened. */
(function () {
  'use strict';

  var RELAY = 'https://formsubmit.co/ajax/team@coolright.co.uk';

  var form = document.getElementById('book-form');
  if (!form) return;

  var card = document.getElementById('book');
  var steps = Array.prototype.slice.call(form.querySelectorAll('.fstep'));
  var dotsWrap = document.getElementById('dots');
  var dots = dotsWrap ? Array.prototype.slice.call(dotsWrap.querySelectorAll('span:not(.step-label)')) : [];
  var label = document.getElementById('step-label');
  var success = card.querySelector('.book-success');
  var current = 0;
  var started = false;

  function field(name) {
    return form.querySelector('[name="' + name + '"]');
  }

  function value(name) {
    var el = field(name);
    return el ? el.value.trim() : '';
  }

  function showError(name, on) {
    var el = form.querySelector('[data-err="' + name + '"]');
    var input = field(name);
    if (el) el.classList.toggle('is-on', on);
    if (input) {
      input.setAttribute('aria-invalid', on ? 'true' : 'false');
      if (on && el) input.setAttribute('aria-describedby', el.id || '');
    }
    if (on) window.CR.track('field_error', { field: name, step: current + 1 });
  }

  // Same rules as lib/validate.js, and deliberately no stricter. A client check
  // that rejects what the server would accept loses enquiries silently.
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function validPostcode(v) {
    var raw = v.toUpperCase().replace(/\s+/g, '');
    if (raw.length < 5 || raw.length > 7) return false;
    return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(raw.slice(0, -3) + ' ' + raw.slice(-3));
  }

  function checkStep(index) {
    var ok = true;
    if (index === 0) {
      var name = !!value('name');
      showError('name', !name);
      var email = validEmail(value('email'));
      showError('email', !email);
      var postcode = validPostcode(value('postcode'));
      showError('postcode', !postcode);
      ok = name && email && postcode;
    }
    if (index === 1) {
      var picked = form.querySelectorAll('[name="job_types"]:checked').length > 0;
      showError('job_types', !picked);
      ok = picked;
    }
    if (index === 2) {
      var property = !!value('property_type');
      showError('property_type', !property);
      ok = property;
    }
    return ok;
  }

  function show(index) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach(function (s, n) { s.classList.toggle('is-active', n === current); });
    dots.forEach(function (d, n) { d.classList.toggle('is-done', n <= current); });
    if (label) label.textContent = 'Step ' + (current + 1) + ' of ' + steps.length;
    if (dotsWrap) dotsWrap.setAttribute('aria-valuenow', String(current + 1));
    var first = steps[current].querySelector('input, select, textarea');
    if (first) first.focus({ preventScroll: true });
  }

  form.addEventListener('input', function () {
    if (started) return;
    started = true;
    window.CR.track('form_start', {});
  });

  form.addEventListener('click', function (e) {
    var next = e.target.closest('[data-next]');
    var back = e.target.closest('[data-back]');
    if (back) return show(current - 1);
    if (!next) return;
    if (!checkStep(current)) return;

    window.CR.track('step_complete', { step: current + 1 });

    // Passing step one is what arms the held partial. From here on we have
    // enough to reply to somebody even if they never finish.
    if (current === 0 && window.CRPartial) {
      window.CRPartial.arm({
        name: value('name'), email: value('email'), postcode: value('postcode'),
      });
    }

    // The property postcode is prefilled from step one, because for most
    // people it is the same one and retyping it is a step they can fail at.
    if (current === 1) {
      var property = field('property_postcode');
      if (property && !property.value) property.value = value('postcode');
    }

    show(current + 1);
  });

  function payload(files) {
    var visit = window.CR.visit;
    return {
      stage: 'complete',
      session_id: visit.session_id,
      name: value('name'),
      email: value('email'),
      phone: value('phone'),
      // The property's postcode is the one the engineer drives to, so it wins
      // when they gave one. Step one's is only how they got started.
      postcode: value('property_postcode') || value('postcode'),
      address_line: value('address_line'),
      town: value('town'),
      property_type: value('property_type'),
      job_types: Array.prototype.map.call(
        form.querySelectorAll('[name="job_types"]:checked'),
        function (el) { return el.value; },
      ),
      notes: value('notes'),
      existing_system: !!(field('existing_system') || {}).checked,
      files: files || [],
      website: value('website'),
      referrer: visit.referrer,
      utm: visit.utm,
      landing_path: visit.landing_path,
    };
  }

  function relay(body, id) {
    var lines = [
      'Name: ' + body.name,
      'Email: ' + body.email,
      'Phone: ' + (body.phone || 'not given'),
      'Postcode: ' + body.postcode,
      'Address: ' + [body.address_line, body.town].filter(Boolean).join(', '),
      'Property: ' + body.property_type + (body.existing_system ? ' (existing system)' : ''),
      'Needs: ' + body.job_types.join(', '),
      'Notes: ' + (body.notes || 'none'),
      'Attachments: ' + (body.files.length || 'none'),
      'Lead id: ' + id,
    ];
    return fetch(RELAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'Quote request: ' + body.name + ', ' + body.postcode,
        message: lines.join('\n'),
      }),
    });
  }

  function finish(note) {
    form.closest('.book-body').hidden = true;
    success.hidden = false;
    if (note) {
      var el = document.getElementById('upload-note');
      el.textContent = note;
      el.hidden = false;
    }
    success.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!checkStep(2)) return;

    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending';

    // Cancel before anything can go wrong. A completed form is not an
    // abandoned one even if the network then fails.
    if (window.CRPartial) window.CRPartial.cancel();

    var upload = { paths: [], failed: 0 };
    if (window.CRUpload) upload = await window.CRUpload.send(window.CR.visit.session_id);

    var body = payload(upload.paths);
    var id = null;

    try {
      var res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await res.json();
      if (!res.ok) {
        Object.keys(data.errors || {}).forEach(function (key) { showError(key, true); });
        button.disabled = false;
        button.textContent = 'Request My Quote';
        window.CR.track('submit_error', { reason: data.error || 'invalid' });
        return;
      }
      id = data.id;
    } catch (err) {
      // The enquiry did not store. Say so plainly and give them the email
      // address rather than a spinner that never stops.
      button.disabled = false;
      button.textContent = 'Request My Quote';
      window.CR.track('submit_error', { reason: 'network' });
      finish('We could not send that just now. Please email team@coolright.co.uk and we will pick it up straight away.');
      return;
    }

    window.CR.track('submit', { count: body.job_types.length });

    // A file must never cost somebody an enquiry, so a failed upload is a note
    // on the confirmation rather than an error to go back and fix.
    var note = upload.failed
      ? (upload.failed === 1
        ? 'One photo did not upload. Reply to our email with it and we will add it to your file.'
        : upload.failed + ' photos did not upload. Reply to our email with them and we will add them to your file.')
      : '';
    finish(note);

    try {
      var sent = await relay(body, id);
      window.CR.post('/api/notified', { id: id, ok: sent.ok, error: sent.ok ? null : 'relay_' + sent.status }, true);
    } catch (err) {
      window.CR.post('/api/notified', { id: id, ok: false, error: 'relay_blocked' }, true);
    }
  });

  show(0);
}());
