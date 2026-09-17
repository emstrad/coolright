/* The services tab strip.

   Every panel is already in the markup. This shows one at a time by toggling
   the hidden attribute, rather than writing innerHTML, so the words are in the
   page for a crawler that does not run JavaScript and for anyone whose script
   fails to load. With scripts off the page shows the first panel and the rest
   stay hidden, which is still readable and still honest. */
(function () {
  'use strict';

  var strip = document.querySelector('.services-pills');
  if (!strip) return;

  var tabs = Array.prototype.slice.call(strip.querySelectorAll('[data-svc]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.service-content'));

  function select(key, focus) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-svc') === key;
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
      if (on && focus) tab.focus();
    });
    panels.forEach(function (panel) {
      panel.hidden = panel.id !== 'panel-' + key;
    });
  }

  strip.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-svc]');
    if (tab) select(tab.getAttribute('data-svc'));
  });

  // A tab strip that cannot be driven from the keyboard is a tab strip half the
  // people who need it cannot use.
  strip.addEventListener('keydown', function (e) {
    var index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    var next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].getAttribute('data-svc'), true);
  });

  // The footer service links open the panel they name rather than dropping the
  // visitor at the top of a section showing something else.
  document.querySelectorAll('[data-svc-link]').forEach(function (link) {
    link.addEventListener('click', function () {
      select(link.getAttribute('data-svc-link'));
    });
  });

  select(tabs.length ? tabs[0].getAttribute('data-svc') : '');
}());
