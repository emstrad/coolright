/* Shared primitives for the staff area. No framework.

   Everything that renders a value goes through el() or text(), which set
   textContent. Lead notes, referrers and campaign names are visitor-supplied,
   so rendering any of them as markup would make this dashboard a stored XSS
   sink: somebody types a script tag into the notes field of a public form and
   it runs here, inside an authenticated session. */
(function () {
  'use strict';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key] === null || attrs[key] === undefined ? '' : String(attrs[key]);
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
      else if (attrs[key] !== null && attrs[key] !== undefined && attrs[key] !== false) {
        node.setAttribute(key, attrs[key] === true ? '' : String(attrs[key]));
      }
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function pounds(pence, withSign) {
    var n = Math.trunc(Number(pence) || 0);
    var sign = n < 0 ? '-' : (withSign && n > 0 ? '+' : '');
    return sign + '£' + (Math.abs(n) / 100).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function pence(pounds) {
    var n = Number(String(pounds).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function date(value) {
    if (!value) return '';
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value)
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function table(columns, rows, build) {
    var head = el('tr', {}, columns.map(function (c) { return el('th', { text: c }); }));
    var body = rows.map(build);
    return el('table', { class: 'grid' }, [
      el('thead', {}, [head]),
      el('tbody', {}, body.length ? body : [
        el('tr', {}, [el('td', { colspan: columns.length, class: 'muted', text: 'Nothing here yet.' })]),
      ]),
    ]);
  }

  function tile(label, value, sub) {
    return el('div', { class: 'tile' }, [
      el('span', { class: 'tile-label', text: label }),
      el('strong', { class: 'tile-value', text: value }),
      sub ? el('span', { class: 'tile-sub', text: sub }) : null,
    ]);
  }

  async function api(action, options) {
    var opts = options || {};
    var query = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
    var res = await fetch('/api/admin/' + action + query, {
      method: opts.body ? 'POST' : 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      window.location.href = '/staff';
      throw new Error('signed out');
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw Object.assign(new Error(data.error || 'failed'), { data: data });
    return data;
  }

  // A cell starting with =, +, - or @ is a formula to a spreadsheet, so a lead
  // note could become one the moment somebody exports and opens the file.
  function csvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadCsv(filename, rows) {
    var body = rows.map(function (row) { return row.map(csvCell).join(','); }).join('\n');
    var url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    var link = el('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  window.UI = {
    el: el, pounds: pounds, pence: pence, date: date, table: table, tile: tile,
    api: api, csvCell: csvCell, downloadCsv: downloadCsv,
  };
}());
