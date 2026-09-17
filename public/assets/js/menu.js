/* The mobile menu. Not a library.

   The button reports its own state, opening moves focus into the panel and
   closing puts it back, Tab is trapped while the panel is open, and Escape,
   an outside click, following a link and a resize all close it. The page
   behind does not scroll. With JavaScript off the inline script in the head
   never removes the no-js class, and the markup works as a plain nav. */
(function () {
  'use strict';

  var toggle = document.getElementById('nav-toggle');
  var panel = document.getElementById('nav-panel');
  if (!toggle || !panel) return;

  var open = false;

  function focusable() {
    return Array.prototype.slice.call(panel.querySelectorAll('a[href], button:not([disabled])'));
  }

  function setOpen(next) {
    if (open === next) return;
    open = next;
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      var first = focusable()[0];
      if (first) first.focus();
    } else {
      toggle.focus();
    }
  }

  toggle.addEventListener('click', function () { setOpen(!open); });

  panel.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') return setOpen(false);
    if (e.key !== 'Tab') return;

    // Trapped, so tabbing does not wander off into a page nobody can see.
    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', function (e) {
    if (!open) return;
    if (e.target.closest('#nav-panel') || e.target.closest('#nav-toggle')) return;
    setOpen(false);
  });

  // A phone rotated to landscape crosses the breakpoint, and a panel left open
  // across it is a panel stuck over a layout that no longer expects it.
  window.addEventListener('resize', function () {
    if (open && window.innerWidth > 960) setOpen(false);
  });

  // The action bar button should put the cursor in the form, not just scroll
  // near it.
  var jump = document.querySelector('[data-focus-form]');
  if (jump) {
    jump.addEventListener('click', function () {
      var first = document.getElementById('f-name');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 400);
    });
  }
}());
