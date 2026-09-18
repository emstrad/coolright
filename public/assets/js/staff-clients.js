/* Client cards. A card is the job joined to the lead it came from, so the
   address, phone, photographs and description are on it without anyone typing
   them twice. There is no clients table. */
(function () {
  'use strict';

  var el = UI.el;

  // Spaces ignored, so n13gz finds N1 3GZ. Every word typed must match, so two
  // words narrow rather than widen.
  function matches(card, query) {
    if (!query) return true;
    var haystack = [
      card.customer_name, card.address_line, card.town, card.postcode, card.email,
      card.phone, card.job_type, card.worker, card.description, card.lead_notes,
    ].join(' ').toLowerCase().replace(/\s+/g, '');
    return query.toLowerCase().split(/\s+/).filter(Boolean)
      .every(function (word) { return haystack.indexOf(word.replace(/\s+/g, '')) !== -1; });
  }

  function payments(card, onSaved) {
    var form = el('form', { class: 'pay-form' }, [
      el('input', { name: 'amount', placeholder: 'Amount, pounds', inputmode: 'decimal' }),
      el('input', { name: 'paid_on', type: 'date', value: new Date().toISOString().slice(0, 10) }),
      el('select', { name: 'label' }, ['deposit', 'stage', 'balance', 'retention'].map(function (l) {
        return el('option', { value: l, text: l });
      })),
      el('button', { class: 'btn btn--primary', type: 'submit', text: 'Record payment' }),
    ]);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var data = new FormData(form);
      await UI.api('payment', {
        body: {
          job_id: card.id,
          amount_pence: UI.pence(data.get('amount')),
          paid_on: data.get('paid_on'),
          label: data.get('label'),
        },
      });
      onSaved();
    });

    return form;
  }

  function open(card, onSaved) {
    var dialog = document.getElementById('card-dialog');
    var address = [card.address_line, card.town, card.postcode].filter(Boolean).join(', ');

    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'dialog-body' }, [
      el('h2', { text: card.customer_name }),
      el('p', { class: 'muted', text: address }),
      el('div', { class: 'row-gap' }, [
        card.phone ? el('a', { class: 'btn', href: 'tel:' + card.phone, text: 'Call ' + card.phone }) : null,
        // The button is tapped in a van, and the app in the van is Waze.
        address ? el('a', {
          class: 'btn',
          target: '_blank',
          rel: 'noopener',
          href: 'https://waze.com/ul?q=' + encodeURIComponent(address),
          text: 'Waze',
        }) : null,
        card.email ? el('a', { class: 'btn', href: 'mailto:' + card.email, text: 'Email' }) : null,
      ]),
      el('div', { class: 'tiles' }, [
        UI.tile('Quote', UI.pounds(card.price_pence), card.status),
        UI.tile('Received', UI.pounds(card.received)),
        UI.tile('Outstanding', UI.pounds(card.outstanding), card.last_paid_on ? 'Last paid ' + UI.date(card.last_paid_on) : 'Nothing yet'),
      ]),
      card.description ? el('p', { text: card.description }) : null,
      card.lead_notes ? el('div', { class: 'card' }, [
        el('h3', { text: 'What they told us' }),
        el('p', { text: card.lead_notes }),
      ]) : null,
      (card.files || []).length ? el('div', { class: 'card' }, [
        el('h3', { text: 'Photographs and attachments' }),
        el('ul', { class: 'files' }, (card.files || []).map(function (path) {
          // Served through an authenticated route, because the blobs are
          // private and a store URL in a page is a link anybody can follow.
          return el('li', {}, [el('a', {
            href: '/api/admin/attachment?path=' + encodeURIComponent(path),
            target: '_blank',
            rel: 'noopener',
            text: path.split('/').pop(),
          })]);
        })),
      ]) : null,
      el('div', { class: 'card' }, [
        el('h3', { text: 'Payments' }),
        payments(card, function () { dialog.close(); onSaved(); }),
      ]),
      el('button', { class: 'btn', text: 'Close', onclick: function () { dialog.close(); } }),
    ]));

    dialog.showModal();
  }

  window.Panels = window.Panels || {};
  window.Panels.clients = async function (node, state) {
    var data = await UI.api('clients');
    var reload = function () { window.Panels.clients(node, state); };
    var query = '';
    var showArchived = false;

    function draw() {
      var list = node.querySelector('.cards-grid');
      list.textContent = '';
      var shown = data.clients.filter(function (card) {
        return matches(card, query) && (showArchived ? card.archived : !card.archived);
      });

      if (!shown.length) list.appendChild(el('p', { class: 'muted', text: 'Nothing matches.' }));

      shown.forEach(function (card) {
        list.appendChild(el('article', {
          class: 'client-card',
          onclick: function () { open(card, reload); },
        }, [
          el('h3', { text: card.customer_name }),
          el('p', { class: 'muted', text: [card.town, card.postcode].filter(Boolean).join(', ') }),
          el('p', { text: UI.date(card.job_date) + (card.job_type ? ' - ' + card.job_type : '') }),
          el('div', { class: 'card-foot' }, [
            el('span', { text: UI.pounds(card.price_pence) }),
            card.outstanding > 0
              ? el('span', { class: 'owed', text: UI.pounds(card.outstanding) + ' owed' })
              : el('span', { class: 'paid', text: 'paid' }),
          ]),
          card.datePassed ? el('span', { class: 'chip chip-warn', text: 'date passed' }) : null,
        ]));
      });
    }

    node.textContent = '';
    node.appendChild(el('div', { class: 'row-between' }, [
      el('h2', { text: 'Clients' }),
      el('div', { class: 'row-gap' }, [
        el('input', {
          type: 'search',
          placeholder: 'Name, address, postcode, phone',
          oninput: function (e) { query = e.target.value; draw(); },
        }),
        el('button', {
          class: 'link',
          text: 'Show archived',
          onclick: function (e) {
            showArchived = !showArchived;
            e.target.textContent = showArchived ? 'Show current' : 'Show archived';
            draw();
          },
        }),
      ]),
    ]));
    node.appendChild(el('div', { class: 'cards-grid' }));
    draw();
  };
}());
