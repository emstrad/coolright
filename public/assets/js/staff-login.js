/* Staff sign-in. Unknown and wrong look identical from here, because the
   server makes them identical. */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var error = document.getElementById('login-error');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    error.hidden = true;

    var button = form.querySelector('button');
    button.disabled = true;

    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: document.getElementById('code').value }),
      });
      if (res.ok) {
        window.location.href = '/staff/dashboard';
        return;
      }
      error.textContent = res.status === 429
        ? 'Too many attempts. Try again in a few minutes.'
        : 'That code is not right.';
    } catch (err) {
      error.textContent = 'Could not reach the server.';
    }

    error.hidden = false;
    button.disabled = false;
  });
}());
