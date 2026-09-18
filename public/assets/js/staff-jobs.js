/* Jobs: the pipeline, the typed price, and the earnings waterfall.

   The browser recomputes the same waterfall while you type, for immediate
   feedback, but the figure that gets stored is always the one the server
   returned, so the two cannot drift into disagreeing about what was paid. */
(function () {
  'use strict';

  var el = UI.el;
  var STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled'];
  var REASONS = ['price', 'timing', 'went elsewhere', 'no longer needed', 'no reply'];

  // The same arithmetic as lib/money.js, for the live preview only.
  function preview(values) {
    var price = values.price;
    var tax = Math.round((price * values.tax * 100) / 10000);
    var afterCosts = price - tax - values.costs;
    var leadFee = Math.round((afterCosts * values.fee * 100) / 10000);
    var remainder = afterCosts - leadFee - values.worker;
    return { tax: tax, afterCosts: afterCosts, leadFee: leadFee, remainder: remainder };
  }

  function field(label, name, value, type) {
    return el('label', { class: 'field' }, [
      el('span', { text: label }),
      el('input', { name: name, type: type || 'text', value: value === null || value === undefined ? '' : value }),
    ]);
  }

  function select(label, name, options, value) {
    return el('label', { class: 'field' }, [
      el('span', { text: label }),
      el('select', { name: name }, [el('option', { value: '', text: '' })].concat(
        options.map(function (o) {
          var option = el('option', { value: o, text: o });
          if (o === value) option.setAttribute('selected', '');
          return option;
        }),
      )),
    ]);
  }

  function editor(job, types, settings, onSaved) {
    var dialog = document.getElementById('card-dialog');
    var form = el('form', { class: 'job-form' }, [
      el('h2', { text: job.id ? 'Job ' + job.id : 'New quote' }),
      el('div', { class: 'field-grid' }, [
        field('Customer', 'customer_name', job.customer_name),
        field('Phone', 'phone', job.phone),
        field('Email', 'email', job.email),
        field('Address', 'address_line', job.address_line),
        field('Town', 'town', job.town),
        field('Postcode', 'postcode', job.postcode),
        select('Job type', 'job_type', types.map(function (t) { return t.key; }), job.job_type),
        select('Status', 'status', STATUSES, job.status || 'quoted'),
        select('Why lost', 'declined_reason', REASONS, job.declined_reason),
        field('Quoted on', 'quoted_on', (job.quoted_on || '').slice(0, 10), 'date'),
        field('Quote expires', 'quote_expires', (job.quote_expires || '').slice(0, 10), 'date'),
        field('Job date', 'job_date', (job.job_date || '').slice(0, 10), 'date'),
        field('Completed on', 'completed_on', (job.completed_on || '').slice(0, 10), 'date'),
        field('Who did it', 'worker', job.worker),
        field('Price, pounds', 'price', job.price_pence ? job.price_pence / 100 : ''),
        field('Materials and subcontract, pounds', 'costs',
          job.costs_pence === null || job.costs_pence === undefined ? '' : job.costs_pence / 100),
        field('Fee for whoever did it, pounds', 'worker_fee',
          job.worker_fee_pence ? job.worker_fee_pence / 100 : ''),
      ]),
      el('textarea', { name: 'description', rows: 3, placeholder: 'What the work is' }),
      el('div', { class: 'waterfall', id: 'waterfall' }),
      el('p', { class: 'err', id: 'job-error', hidden: true }),
      el('div', { class: 'row-end' }, [
        el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { dialog.close(); } }),
        el('button', { type: 'submit', class: 'btn btn--primary', text: 'Save' }),
      ]),
    ]);

    form.querySelector('[name="description"]').value = job.description || '';

    function redraw() {
      var data = new FormData(form);
      var costsRaw = String(data.get('costs') || '').trim();
      var out = preview({
        price: UI.pence(data.get('price')),
        costs: costsRaw === '' ? 0 : UI.pence(costsRaw),
        tax: Number(job.tax_percent ?? settings.tax_percent),
        fee: Number(job.lead_fee_percent ?? settings.lead_fee_percent),
        worker: UI.pence(data.get('worker_fee')),
      });
      var partners = (job.partners && job.partners.length ? job.partners : settings.partners) || [];
      var share = partners.length ? Math.trunc(Math.abs(out.remainder) / partners.length) : 0;
      var sign = out.remainder < 0 ? -1 : 1;

      var box = form.querySelector('#waterfall');
      box.textContent = '';
      [
        ['Tax set aside', -out.tax],
        ['Materials and subcontract', costsRaw === '' ? null : -UI.pence(costsRaw)],
        ['Lead fee, after tax and costs', -out.leadFee],
        ['Fee for whoever did it', -UI.pence(data.get('worker_fee'))],
        ['Left to split', out.remainder],
      ].forEach(function (row) {
        box.appendChild(el('div', { class: 'wf-row' }, [
          el('span', { text: row[0] }),
          el('strong', { text: row[1] === null ? 'not known yet' : UI.pounds(row[1], true) }),
        ]));
      });
      partners.forEach(function (name, i) {
        var pence = sign * (share + (i === 0 ? Math.abs(out.remainder) - share * partners.length : 0));
        box.appendChild(el('div', { class: 'wf-row wf-partner' }, [
          el('span', { text: name }), el('strong', { text: UI.pounds(pence) }),
        ]));
      });
      if (!partners.length) {
        box.appendChild(el('p', { class: 'muted', text: 'No partners set. Add them in settings to split the remainder.' }));
      }
    }

    form.addEventListener('input', redraw);
    redraw();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var costsRaw = String(data.get('costs') || '').trim();
      var body = { id: job.id };
      ['customer_name', 'phone', 'email', 'address_line', 'town', 'postcode', 'job_type',
        'status', 'declined_reason', 'quoted_on', 'quote_expires', 'job_date',
        'completed_on', 'worker', 'description'].forEach(function (name) {
        body[name] = data.get(name) || null;
      });
      body.price_pence = UI.pence(data.get('price'));
      body.costs_pence = costsRaw === '' ? null : UI.pence(costsRaw);
      body.worker_fee_pence = UI.pence(data.get('worker_fee'));
      body.lead_id = job.lead_id || null;

      try {
        await UI.api('job', { body: body });
        dialog.close();
        onSaved();
      } catch (err) {
        var box = form.querySelector('#job-error');
        var errors = (err.data && err.data.errors) || {};
        box.textContent = Object.values(errors)[0] || 'Could not save that.';
        box.hidden = false;
      }
    });

    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'dialog-body' }, [form]));
    dialog.showModal();
  }

  window.Panels = window.Panels || {};
  window.Panels.jobs = async function (node, state) {
    var data = await UI.api('jobs');
    var reload = function () { window.Panels.jobs(node, state); };

    node.textContent = '';
    node.appendChild(el('div', { class: 'row-between' }, [
      el('h2', { text: 'Jobs' }),
      el('button', {
        class: 'btn btn--primary',
        text: 'New quote',
        onclick: function () { editor({}, data.types, data.settings, reload); },
      }),
    ]));

    node.appendChild(UI.table(
      ['Status', 'Customer', 'Postcode', 'Type', 'Quoted', 'Date', 'Price', 'Received', 'Outstanding', ''],
      data.jobs,
      function (job) {
        return el('tr', { class: 'status-' + job.status }, [
          el('td', {}, [el('span', { class: 'chip chip-' + job.status, text: job.status })]),
          el('td', { text: job.customer_name }),
          el('td', { text: job.postcode }),
          el('td', { text: job.job_type }),
          el('td', { text: UI.date(job.quoted_on) }),
          el('td', { text: UI.date(job.job_date) }),
          el('td', { text: UI.pounds(job.price_pence) }),
          el('td', { text: UI.pounds(job.payment.received) }),
          el('td', {
            class: job.payment.outstanding > 0 ? 'owed' : '',
            text: job.payment.outstanding > 0 ? UI.pounds(job.payment.outstanding) : 'paid',
          }),
          el('td', {}, [el('button', {
            class: 'link',
            text: 'Edit',
            onclick: function () { editor(job, data.types, data.settings, reload); },
          })]),
        ]);
      },
    ));
  };
}());
