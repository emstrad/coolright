/* The dashboard: marketing above, pipeline below.

   Every count arrives already aggregated in SQL. Nothing here counts rows. */
(function () {
  'use strict';

  var el = UI.el;

  function counters(c) {
    return el('div', { class: 'tiles' }, [
      UI.tile('Visits', c.visits),
      UI.tile('Form starts', c.form_starts),
      UI.tile('Enquiries', c.enquiries),
      UI.tile('Held partials', c.partials, 'Half-finished forms worth a call'),
      UI.tile('Call clicks', c.call_clicks),
      UI.tile('Email not sent', c.unnotified, c.unnotified ? 'Relay blocked, chase these' : 'All relayed'),
    ]);
  }

  function funnel(steps, starts) {
    var rows = steps.map(function (s) { return s; });
    return UI.table(['Step', 'Reached', 'Drop-off'], rows, function (row, i) {
      var previous = i === 0 ? starts : rows[i - 1].sessions;
      var drop = previous ? Math.round(((previous - row.sessions) / previous) * 100) : 0;
      return el('tr', {}, [
        el('td', { text: 'Step ' + row.step }),
        el('td', { text: row.sessions }),
        el('td', { text: previous ? drop + '%' : '' }),
      ]);
    });
  }

  function simple(title, rows, keyName, valueName) {
    return el('div', { class: 'card' }, [
      el('h3', { text: title }),
      UI.table([keyName, valueName], rows, function (row) {
        var keys = Object.keys(row);
        return el('tr', {}, [
          el('td', { text: row[keys[0]] === null ? 'none' : row[keys[0]] }),
          el('td', { text: row[keys[1]] }),
        ]);
      }),
    ]);
  }

  function leadRow(lead, onOpen) {
    return el('tr', { class: lead.stage === 'partial' ? 'is-partial' : '' }, [
      el('td', { text: UI.date(lead.created_at) }),
      el('td', { text: lead.stage === 'partial' ? 'Partial' : 'Enquiry' }),
      el('td', { text: lead.name }),
      el('td', { text: lead.postcode }),
      el('td', { text: (lead.job_types || []).join(', ') }),
      el('td', { text: lead.channel }),
      el('td', { text: lead.notified_at ? 'Sent' : (lead.notify_error || 'not sent') }),
      el('td', {}, [el('button', { class: 'link', text: 'Timeline', onclick: function () { onOpen(lead); } })]),
    ]);
  }

  function pipelineBlock(p) {
    var rate = p.rate;
    return el('div', {}, [
      el('h2', { text: 'Pipeline' }),
      el('div', { class: 'tiles' }, [
        UI.tile('Quotes sent', rate.sent),
        UI.tile('Won', rate.won),
        UI.tile('Conversion', rate.rate === null ? 'no decisions yet' : rate.rate + '%',
          'Of quotes actually decided'),
        UI.tile('Average quote', UI.pounds(rate.avg_quote)),
        UI.tile('Average won', UI.pounds(rate.avg_won)),
        UI.tile('Still out', UI.pounds(rate.open_value), rate.open + ' open quotes'),
      ]),
      el('div', { class: 'two-up' }, [
        el('div', { class: 'card' }, [
          el('h3', { text: 'Conversion by job type' }),
          UI.table(['Type', 'Sent', 'Won', 'Rate'], p.byType, function (row) {
            return el('tr', {}, [
              el('td', { text: row.label }), el('td', { text: row.sent }),
              el('td', { text: row.won }), el('td', { text: row.rate === null ? '' : row.rate + '%' }),
            ]);
          }),
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: 'Conversion by channel' }),
          UI.table(['Channel', 'Sent', 'Won', 'Rate'], p.byChannel, function (row) {
            return el('tr', {}, [
              el('td', { text: row.label }), el('td', { text: row.sent }),
              el('td', { text: row.won }), el('td', { text: row.rate === null ? '' : row.rate + '%' }),
            ]);
          }),
        ]),
      ]),
      el('div', { class: 'two-up' }, [
        el('div', { class: 'card' }, [
          el('h3', { text: 'Money owed on finished work' }),
          el('p', { class: 'muted', text: 'Oldest first. The phone number is right there.' }),
          UI.table(['Customer', 'Phone', 'Completed', 'Outstanding'], p.unpaid, function (row) {
            return el('tr', {}, [
              el('td', { text: row.customer_name }), el('td', { text: row.phone }),
              el('td', { text: UI.date(row.completed_on) }),
              el('td', { class: 'owed', text: UI.pounds(row.outstanding) }),
            ]);
          }),
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: 'Quotes gone quiet' }),
          el('p', { class: 'muted', text: 'Sent three weeks ago or more, still undecided.' }),
          UI.table(['Customer', 'Phone', 'Sent', 'Value'], p.stale, function (row) {
            return el('tr', {}, [
              el('td', { text: row.customer_name }), el('td', { text: row.phone }),
              el('td', { text: UI.date(row.quoted_on) }), el('td', { text: UI.pounds(row.price_pence) }),
            ]);
          }),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'In the diary' }),
        UI.table(['Date', 'Customer', 'Postcode', 'Value', 'Who'], p.booked, function (row) {
          return el('tr', {}, [
            el('td', { text: UI.date(row.job_date) }), el('td', { text: row.customer_name }),
            el('td', { text: row.postcode }), el('td', { text: UI.pounds(row.price_pence) }),
            el('td', { text: row.worker }),
          ]);
        }),
      ]),
    ]);
  }

  async function showTimeline(lead) {
    var dialog = document.getElementById('card-dialog');
    var data = await UI.api('timeline', { query: { session_id: lead.session_id } });
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'dialog-body' }, [
      el('h2', { text: lead.name + ', ' + (lead.postcode || '') }),
      el('p', { class: 'muted', text: lead.notes || 'No notes given.' }),
      UI.table(['When', 'Event', 'Detail'], data.events, function (event) {
        return el('tr', {}, [
          el('td', { text: new Date(event.created_at).toLocaleString('en-GB') }),
          el('td', { text: event.type }),
          el('td', { text: JSON.stringify(event.detail) }),
        ]);
      }),
      el('button', { class: 'btn', text: 'Close', onclick: function () { dialog.close(); } }),
    ]));
    dialog.showModal();
  }

  window.Panels = window.Panels || {};
  window.Panels.dashboard = async function (node, state) {
    var data = await UI.api('summary', { query: { range: state.range } });
    var m = data.marketing;

    node.textContent = '';
    node.appendChild(el('h2', { text: 'Marketing' }));
    node.appendChild(counters(m.counters));
    node.appendChild(el('div', { class: 'two-up' }, [
      el('div', { class: 'card' }, [el('h3', { text: 'Form funnel' }), funnel(m.steps, m.counters.form_starts)]),
      simple('Validation errors by field', m.errors, 'Field', 'Hits'),
    ]));
    node.appendChild(el('div', { class: 'two-up' }, [
      simple('Calls by placement', m.calls, 'Placement', 'Clicks'),
      simple('Devices', m.devices, 'Device', 'Enquiries'),
    ]));
    node.appendChild(el('div', { class: 'two-up' }, [
      simple('Sources', m.channels, 'Channel', 'Enquiries'),
      simple('Referrers', m.referrers, 'Host', 'Enquiries'),
    ]));
    node.appendChild(el('div', { class: 'two-up' }, [
      simple('Campaigns', m.campaigns, 'Campaign', 'Enquiries'),
      simple('Landing pages', m.pages, 'Path', 'Enquiries'),
    ]));

    node.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Leads' }),
      el('button', {
        class: 'link',
        text: 'Export CSV',
        onclick: function () {
          UI.downloadCsv('leads.csv', [
            ['Created', 'Stage', 'Name', 'Email', 'Phone', 'Postcode', 'Needs', 'Notes', 'Channel'],
          ].concat(m.leads.map(function (l) {
            return [l.created_at, l.stage, l.name, l.email, l.phone, l.postcode,
              (l.job_types || []).join(' / '), l.notes, l.channel];
          })));
        },
      }),
      UI.table(
        ['When', 'Stage', 'Name', 'Postcode', 'Needs', 'Channel', 'Email', ''],
        m.leads,
        function (lead) { return leadRow(lead, showTimeline); },
      ),
    ]));

    node.appendChild(pipelineBlock(data.pipeline));
  };
}());
