/* Optional postcode lookup.

   The typed fields are the truth. This only fills them in, so no key, no
   results and a provider that is down all end at the same sentence, and the
   visitor types the address exactly as they would have anyway. */
(function () {
  'use strict';

  var postcode = document.getElementById('f-property-postcode');
  var line = document.getElementById('f-address');
  var town = document.getElementById('f-town');
  if (!postcode || !line) return;

  var wrap = line.parentNode;
  var picker = null;
  var lastLookup = '';

  function clear() {
    if (picker) { picker.remove(); picker = null; }
  }

  function offer(addresses) {
    clear();
    if (!addresses.length) return;

    picker = document.createElement('select');
    picker.className = 'address-picker';
    picker.setAttribute('aria-label', 'Choose your address, or keep typing');

    var first = document.createElement('option');
    first.textContent = addresses.length + ' addresses found, choose one';
    first.value = '';
    picker.appendChild(first);

    addresses.forEach(function (a, i) {
      var option = document.createElement('option');
      // textContent throughout: this arrives over a network from somebody
      // else's service.
      option.textContent = a.line + (a.town ? ', ' + a.town : '');
      option.value = String(i);
      picker.appendChild(option);
    });

    picker.addEventListener('change', function () {
      var chosen = addresses[Number(picker.value)];
      if (!chosen) return;
      line.value = chosen.line;
      if (town && chosen.town) town.value = chosen.town;
      line.focus();
    });

    wrap.insertBefore(picker, line.nextSibling);
  }

  function lookup() {
    var value = postcode.value.trim();
    if (!value || value === lastLookup) return;
    lastLookup = value;
    fetch('/api/address?postcode=' + encodeURIComponent(value))
      .then(function (res) { return res.ok ? res.json() : { addresses: [] }; })
      .then(function (data) { offer(data.addresses || []); })
      .catch(function () { clear(); });
  }

  postcode.addEventListener('blur', lookup);
  postcode.addEventListener('change', lookup);
}());
