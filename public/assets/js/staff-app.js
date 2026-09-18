/* Tab switching and the shared period. Loaded last, once every panel has
   registered itself on window.Panels. */
(function () {
  'use strict';

  var panels = window.Panels || {};
  var state = { tab: 'dashboard', range: '30d' };

  function render() {
    Object.keys(panels).forEach(function (name) {
      var node = document.getElementById('panel-' + name);
      if (!node) return;
      node.hidden = name !== state.tab;
    });

    var panel = panels[state.tab];
    var node = document.getElementById('panel-' + state.tab);
    if (!panel || !node) return;

    node.textContent = '';
    node.appendChild(UI.el('p', { class: 'muted', text: 'Loading' }));
    panel(node, state).catch(function (err) {
      node.textContent = '';
      node.appendChild(UI.el('p', { class: 'err', text: 'Could not load: ' + err.message }));
    });
  }

  document.querySelectorAll('.tab').forEach(function (button) {
    button.addEventListener('click', function () {
      state.tab = button.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (b) {
        if (b === button) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      render();
    });
  });

  document.querySelectorAll('.range').forEach(function (button) {
    button.addEventListener('click', function () {
      state.range = button.getAttribute('data-range');
      document.querySelectorAll('.range').forEach(function (b) {
        b.classList.toggle('is-on', b === button);
      });
      render();
    });
  });

  document.getElementById('sign-out').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/staff';
  });

  render();
}());
