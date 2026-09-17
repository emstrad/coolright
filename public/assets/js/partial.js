/* The held partial.

   Most trade sites lose the visitor who fills in half a form. This one calls
   them back. Passing step one arms a partial; it is then held, not sent, and
   flushed only when the visitor has genuinely gone:

     - the page has been hidden for 45 seconds, or
     - they have been idle for 3 minutes with the form still open.

   Submitting cancels it, so someone who completes the form produces one row and
   not two. Partial and complete share the visit's session id, so the two
   reconcile on the dashboard whatever order they arrive in. */
(function () {
  'use strict';

  var HIDDEN_MS = 45000;
  var IDLE_MS = 180000;

  var armed = null;
  var sent = false;
  var cancelled = false;
  var hiddenTimer = null;
  var idleTimer = null;

  function stop() {
    if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function flush() {
    if (!armed || sent || cancelled) return;
    sent = true;
    stop();
    var visit = (window.CR || {}).visit || {};
    // Beacon, because by definition this fires when the visitor has stopped
    // paying attention and the page may be about to go away.
    window.CR.post('/api/lead', {
      stage: 'partial',
      session_id: visit.session_id,
      name: armed.name,
      email: armed.email,
      postcode: armed.postcode,
      referrer: visit.referrer,
      utm: visit.utm,
      landing_path: visit.landing_path,
    }, true);
  }

  function idleWatch() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!armed || sent || cancelled) return;
    idleTimer = setTimeout(flush, IDLE_MS);
  }

  function arm(data) {
    if (sent || cancelled) return;
    armed = data;
    idleWatch();
  }

  // Called on submit. A completed form is not an abandoned one, and the flag
  // stays set so a timer that was already running cannot undo that.
  function cancel() {
    cancelled = true;
    armed = null;
    stop();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (!armed || sent || cancelled) return;
      // Switching tabs for half a minute is not abandonment. Coming back
      // clears this before it ever fires.
      hiddenTimer = setTimeout(flush, HIDDEN_MS);
    } else if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
  });

  ['keydown', 'pointerdown', 'scroll', 'input'].forEach(function (type) {
    window.addEventListener(type, idleWatch, { passive: true });
  });

  window.CRPartial = { arm: arm, cancel: cancel, flush: flush };
}());
