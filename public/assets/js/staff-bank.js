/* Bank reconciliation. Upload the CSV, settle it against the jobs.

   Every line becomes one of two things, never both: matched to a job payment,
   or split between people. Money out can instead be assigned to a job as a
   materials cost. The balance panel shows both sides of the identity and the
   difference between them. */
(function () {
  'use strict';

  var el = UI.el;

  function balancePanel(b) {
    var rows = Object.keys(b.people).map(function (name) {
      return [name, b.people[name]];
    }).concat([
      ['Tax pot', b.taxPot],
      ['Materials assigned but not recorded', b.materials],
      ['Paid on jobs not yet completed', b.onOpenJobs],
      ['Money in not matched or split', b.unmatchedIn],
      ['Spend not split or assigned', b.unallocatedOut],
      ['Difference', b.difference],
    ]);

    return el('div', { class: 'card' }, [
      el('h3', { text: 'Where the money went' }),
      el('p', { class: 'muted', text: 'From ' + (UI.date(b.from) || 'the first imported line') + '.' }),
      el('div', { class: 'tiles' }, [
        UI.tile('Bank in', UI.pounds(b.bankIn)),
        UI.tile('Bank out', UI.pounds(b.bankOut)),
        UI.tile('Net', UI.pounds(b.net)),
        UI.tile('Allocated', UI.pounds(b.allocated),
          b.difference === 0 ? 'Both sides agree' : 'Difference of ' + UI.pounds(b.difference)),
      ]),
      UI.table(['Bucket', 'Amount'], rows, function (row) {
        return el('tr', { class: row[0] === 'Difference' && row[1] !== 0 ? 'is-warn' : '' }, [
          el('td', { text: row[0] }), el('td', { text: UI.pounds(row[1], true) }),
        ]);
      }),
    ]);
  }

  function splitEditor(line, people, reload) {
    var chosen = {};
    var dialog = document.getElementById('card-dialog');
    var boxes = people.map(function (name) {
      return el('label', { class: 'check-row' }, [
        el('input', {
          type: 'checkbox',
          onchange: function (e) {
            if (e.target.checked) chosen[name] = 1; else delete chosen[name];
          },
        }),
        el('span', { text: name }),
      ]);
    });

    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'dialog-body' }, [
      el('h2', { text: 'Split this line' }),
      el('p', { class: 'muted', text: line.description }),
      el('p', { text: UI.pounds(line.amount_pence, true) }),
      el('div', {}, boxes),
      el('label', { class: 'check-row' }, [
        el('input', { type: 'checkbox', id: 'split-learn', checked: true }),
        el('span', { text: 'Remember this for lines like it' }),
      ]),
      el('div', { class: 'row-end' }, [
        el('button', { class: 'btn', text: 'Cancel', onclick: function () { dialog.close(); } }),
        el('button', {
          class: 'btn btn--primary',
          text: 'Split equally',
          onclick: async function () {
            await UI.api('bank-update', {
              body: {
                id: line.id,
                action: 'split',
                split: chosen,
                learn: document.getElementById('split-learn').checked,
              },
            });
            dialog.close();
            reload();
          },
        }),
      ]),
    ]));
    dialog.showModal();
  }

  function jobPicker(line, jobs, action, reload) {
    // Suggestions first, because the ranking is the whole point of scoring.
    var ranked = (line.suggestions || []).map(function (s) { return s.job_id; });
    var sorted = jobs.slice().sort(function (a, b) {
      return ranked.indexOf(b.id) - ranked.indexOf(a.id);
    });

    var select = el('select', {}, [el('option', { value: '', text: 'Choose a job' })].concat(
      sorted.map(function (job) {
        var suggested = ranked.indexOf(job.id) !== -1 ? ' (suggested)' : '';
        return el('option', {
          value: job.id,
          text: job.customer_name + ', ' + UI.pounds(job.outstanding) + ' outstanding' + suggested,
        });
      }),
    ));

    select.addEventListener('change', async function () {
      if (!select.value) return;
      await UI.api('bank-update', {
        body: { id: line.id, action: action, job_id: Number(select.value), learn: action === 'assign' },
      });
      reload();
    });

    return select;
  }

  window.Panels = window.Panels || {};
  window.Panels.bank = async function (node, state) {
    var data = await UI.api('bank');
    var reload = function () { window.Panels.bank(node, state); };
    var people = Object.keys(data.balance.people).concat(['tax'])
      .filter(function (v, i, a) { return a.indexOf(v) === i; });

    var upload = el('input', { type: 'file', accept: '.csv,text/csv' });
    upload.addEventListener('change', async function () {
      var file = upload.files[0];
      if (!file) return;
      var text = await file.text();
      var res = await fetch('/api/admin/bank-import?filename=' + encodeURIComponent(file.name), {
        method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text,
      });
      var out = await res.json();
      window.alert(res.ok
        ? out.added + ' new lines imported, ' + out.skipped + ' skipped as pending or not sterling.'
        : 'Could not read that file.');
      reload();
    });

    node.textContent = '';
    node.appendChild(el('div', { class: 'row-between' }, [
      el('h2', { text: 'Bank' }),
      upload,
    ]));
    node.appendChild(balancePanel(data.balance));

    node.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Statements' }),
      UI.table(['File', 'Uploaded', 'Lines', 'New', ''], data.statements, function (s) {
        return el('tr', {}, [
          el('td', { text: s.filename }), el('td', { text: UI.date(s.uploaded_at) }),
          el('td', { text: s.rows_total }), el('td', { text: s.rows_new }),
          el('td', {}, [el('button', {
            class: 'link',
            text: 'Remove',
            onclick: async function () {
              if (!window.confirm('Remove this upload and any payments it created?')) return;
              await UI.api('bank-remove', { body: { id: s.id } });
              reload();
            },
          })]),
        ]);
      }),
    ]));

    node.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Transactions' }),
      UI.table(['Date', 'Description', 'Amount', 'Category', 'Settled as', ''], data.transactions, function (line) {
        var settled = line.job_id
          ? (line.amount_pence > 0 ? 'Paid: ' : 'Cost on: ') + (line.customer_name || 'job ' + line.job_id)
          : (line.split ? 'Split: ' + Object.keys(line.split).join(', ') : 'Not settled');

        return el('tr', { class: line.job_id || line.split ? '' : 'is-open' }, [
          el('td', { text: UI.date(line.happened_on) }),
          el('td', { text: line.description }),
          el('td', { class: line.amount_pence < 0 ? 'out' : 'in', text: UI.pounds(line.amount_pence, true) }),
          el('td', { text: line.category || '' }),
          el('td', { text: settled }),
          el('td', {}, [
            line.job_id || line.split
              ? el('button', {
                class: 'link',
                text: 'Undo',
                onclick: async function () {
                  await UI.api('bank-update', {
                    body: { id: line.id, action: line.job_id ? 'unmatch' : 'split', split: null },
                  });
                  reload();
                },
              })
              : el('div', { class: 'row-gap' }, [
                jobPicker(line, data.jobs, line.amount_pence > 0 ? 'match' : 'assign', reload),
                el('button', {
                  class: 'link',
                  text: 'Split',
                  onclick: function () { splitEditor(line, people, reload); },
                }),
              ]),
          ]),
        ]);
      }),
    ]));
  };
}());
