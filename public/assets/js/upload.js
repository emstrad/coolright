/* Attachments.

   A file must never cost somebody an enquiry. Uploads happen on submit, one at
   a time, and anything that fails is counted and mentioned on the confirmation
   rather than thrown up as an error to go back and fix.

   Two paths, in order:
     1. a ticket and a direct PUT to blob storage, which has no meaningful size
        limit because the bytes never enter a serverless function;
     2. a proxied POST, which tops out near 4MB because Vercel will not carry a
        larger body into a function.

   Photos are re-encoded through a canvas to 2000px on the long edge, taking a
   3MB camera JPEG to roughly 300KB. On mobile data that is the difference
   between an enquiry and an abandoned form. PDFs are sent untouched: a
   competitor's quote is the document you most want to receive intact. */
(function () {
  'use strict';

  var MAX_EDGE = 2000;
  var PROXY_LIMIT = 4 * 1024 * 1024;

  var input = document.getElementById('f-files');
  var list = document.getElementById('file-list');
  var row = document.querySelector('[data-uploads]');
  if (!input || !row) return;

  // Revealed only once we know the browser can do the work, so nobody is shown
  // a field that will not function.
  if (window.FileReader && window.fetch) row.hidden = false;

  input.addEventListener('change', function () {
    if (!list) return;
    list.textContent = '';
    Array.prototype.forEach.call(input.files, function (file) {
      var li = document.createElement('li');
      // textContent, not innerHTML: the name comes off the visitor's device.
      li.textContent = file.name;
      list.appendChild(li);
    });
    window.CR.track('upload', { count: input.files.length });
  });

  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) || file.type === 'image/heic') return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 900000) { URL.revokeObjectURL(url); return resolve(file); }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          resolve(blob && blob.size < file.size ? blob : file);
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function safeName(name) {
    // Must match the shape lib/validate.js accepts, or the stored path is
    // dropped and the photo is orphaned.
    var clean = String(name).replace(/[^A-Za-z0-9._-]/g, '-').slice(-60);
    return clean || 'file';
  }

  async function direct(sessionId, name, blob) {
    var res = await fetch('/api/upload?mode=ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, name: name, type: blob.type }),
    });
    if (!res.ok) return null;
    var ticket = await res.json();
    if (!ticket.url || !ticket.token) return null;
    var put = await fetch(ticket.url, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + ticket.token,
        'x-api-version': String(ticket.apiVersion || 7),
        'x-content-type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
    return put.ok ? ticket.path : null;
  }

  async function proxied(sessionId, name, blob) {
    if (blob.size > PROXY_LIMIT) return null;
    var res = await fetch('/api/upload?mode=proxy&session_id=' + encodeURIComponent(sessionId)
      + '&name=' + encodeURIComponent(name), {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) return null;
    var data = await res.json();
    return data.path || null;
  }

  async function send(sessionId) {
    var out = { paths: [], failed: 0 };
    var files = input.files ? Array.prototype.slice.call(input.files, 0, 12) : [];
    for (var i = 0; i < files.length; i += 1) {
      var name = safeName(files[i].name);
      try {
        var blob = await shrink(files[i]);
        // One at a time. Several large uploads in parallel on a phone is how a
        // connection falls over just as somebody is trying to reach you.
        var path = await direct(sessionId, name, blob);
        if (!path) path = await proxied(sessionId, name, blob);
        if (path) out.paths.push(path); else out.failed += 1;
      } catch (e) {
        out.failed += 1;
      }
    }
    return out;
  }

  window.CRUpload = { send: send };
}());
