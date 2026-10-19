const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../../..');

function screen(now = '2026-10-19T12:00:00Z', items = []) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const listeners = {};
  const requests = [];
  const opened = [];
  let searchInput;
  const document = {
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    querySelector(selector) { return selector === '[data-followup-module-search]' ? searchInput : null; }
  };
  const state = { role: 'SALES_AGENT', followups: { items }, ready: false };
  const window = {};
  const context = vm.createContext({
    window, document, state, Date: Clock, setInterval: () => {},
    openFollowup: id => { opened.push(id); state.drawer = 'followup'; },
    apiFetch: async (endpoint, options) => { requests.push({ endpoint, ...options }); return { data: {} }; },
    showToast: () => {},
    FormData: class {
      constructor(form) { this.data = new Map(Object.entries(form.values)); }
      entries() { return this.data.entries(); }
      get(name) { return this.data.get(name); }
    },
    badge: text => `<span>${text}</span>`, icons: { search: '' },
    pageHeader: (_, title) => `<h1>${title}</h1>`,
    render: () => {
      searchInput = {
        value: state.followupModule.search,
        focus() { this.focused = true; },
        setSelectionRange(start, end, direction) { this.selection = [start, end, direction]; }
      };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend/features/customers/constants/customer-options.js'), 'utf8'), context);
  for (const file of [
    'constants/followup-options.js', 'utils/followup-overdue-utils.js',
    'utils/followup-metrics-utils.js', 'utils/followup-note-ui.js', 'followups-module.js'
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend/features/follow-ups', file), 'utf8'), context);
  }
  window.AureumFollowUpRuntime.render();
  return {
    state, requests, opened, render: window.AureumFollowUpRuntime.render, drawer: window.renderFollowupDrawer,
    clickAction(action, id) {
      const button = { dataset: { followupModuleAction: action, followupId: id } };
      const row = { dataset: { followupModuleOpen: id } };
      for (const listener of listeners.click) listener({ preventDefault() {}, target: { closest: selector => selector === '[data-followup-module-action]' ? button : selector === '[data-followup-module-open]' ? row : null } });
    },
    async submit(id, values) {
      const button = { disabled: false };
      const form = { id, values, dataset: {}, querySelector: () => button };
      await Promise.all(listeners.submit.map(listener => listener({ target: form, preventDefault() {} })));
      return button;
    },
    clickMonth(direction) {
      const button = { dataset: { followupModuleMonth: direction } };
      for (const listener of listeners.click) listener({ target: { closest: selector => selector === '[data-followup-module-month]' ? button : null } });
    },
    search(value, start, end, direction) {
      const input = { value, selectionStart: start, selectionEnd: end, selectionDirection: direction, matches: selector => selector === '[data-followup-module-search]' };
      for (const listener of listeners.input) listener({ target: input });
      return searchInput;
    }
  };
}

const reminder = (id, due_date) => ({ id, customer: id, status: 'Pending', due_date, due_time: '10:00' });

test('Tomorrow shows the scheduled next Pakistan date, including month and year rollover', () => {
  for (const [now, today, tomorrow] of [
    ['2026-10-19T12:00:00Z', '2026-10-19', '2026-10-20'],
    ['2026-10-31T20:00:00Z', '2026-11-01', '2026-11-02'],
    ['2026-12-31T12:00:00Z', '2026-12-31', '2027-01-01']
  ]) {
    const app = screen(now, [reminder('due-today', today), reminder('due-tomorrow', tomorrow)]);
    app.state.followupModule.date = 'tomorrow';
    const html = app.render();
    assert.match(html, /Schedule follow-up for due-tomorrow/);
    assert.doesNotMatch(html, /Schedule follow-up for due-today/);
  }
});

test('calendar arrows move one month in both directions and Today restores the current month', () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['Asia/Karachi', 'UTC', 'America/Los_Angeles']) {
      process.env.TZ = timezone;
      const app = screen();
      app.state.followupModule.calendarOpen = true;
      app.clickMonth('next');
      assert.equal(app.state.followupModule.calendarMonth, '2026-11', timezone);
      assert.match(app.render(), /November 2026/);
      app.clickMonth('prev');
      assert.equal(app.state.followupModule.calendarMonth, '2026-10', timezone);
      app.clickMonth('prev');
      assert.equal(app.state.followupModule.calendarMonth, '2026-09', timezone);
      app.clickMonth('today');
      assert.equal(app.state.followupModule.calendarMonth, '2026-10', timezone);
      // October 1, 2026 is Thursday, regardless of the browser's timezone.
      const grid = app.render().split('class="followup-calendar-grid">')[1].split('<button')[0];
      assert.equal((grid.match(/followup-calendar-empty/g) || []).length, 4, timezone);
      app.state.followupModule.calendarMonth = '2026-12';
      app.clickMonth('next');
      assert.equal(app.state.followupModule.calendarMonth, '2027-01', timezone);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('search keeps keyboard focus and selection while filtering customer rows', () => {
  const app = screen(undefined, [reminder('Ahmed Khan', '2026-10-20'), reminder('Sara Malik', '2026-10-20')]);
  const input = app.search('Ahmed', 2, 4, 'backward');
  assert.equal(input.focused, true);
  assert.deepEqual(input.selection, [2, 4, 'backward']);
  assert.match(app.render(), /Schedule follow-up for Ahmed Khan/);
  assert.doesNotMatch(app.render(), /Schedule follow-up for Sara Malik/);
});

test('customer rows offer only Reschedule and Add note and open the selected form', () => {
  const app = screen(undefined, [reminder('customer-followup', '2026-10-18')]);
  const html = app.render();
  assert.match(html, /data-followup-module-action="reschedule"/);
  assert.match(html, /data-followup-module-action="note"/);
  assert.doesNotMatch(html, /data-followup-module-action="(?:edit|cancel|done|call|whatsapp)"/);
  app.state.followupDetail = { data: reminder('customer-followup', '2026-10-18') };
  app.clickAction('note', 'customer-followup');
  assert.deepEqual(app.opened, ['customer-followup']);
  let drawer = app.drawer();
  assert.match(drawer, /id="followup-module-note-form"/);
  assert.match(drawer, /name="next_followup_days" value="none"/);
  assert.doesNotMatch(drawer, /name="next_due_date"|name="next_due_time"|name="followup_tag"/);
  app.clickAction('reschedule', 'customer-followup');
  drawer = app.drawer();
  assert.match(drawer, /id="followup-module-reschedule-form"/);
  assert.match(drawer, /name="next_due_date" type="date" value="2026-10-20"/);
  assert.match(drawer, /name="next_due_time" type="time"/);
  assert.match(drawer, /value="Follow-up Needed" selected/);
  assert.match(drawer, /value="VIP"/);
});

test('rescheduling and adding notes submit the intended workflow payload and close after saving', async () => {
  const app = screen();
  app.state.followupDetail = { data: { ...reminder('followup', '2026-10-18'), customer_id: 'customer' } };
  app.state.drawer = 'followup';
  const reschedule = { note: 'Customer agreed to a call.', customer_contacted: 'true', next_followup_days: 'custom', next_due_date: '2026-10-20', next_due_time: '14:30', followup_tag: 'Follow-up Needed' };
  const button = await app.submit('followup-module-reschedule-form', reschedule);
  assert.equal(button.disabled, false);
  assert.equal(app.requests[0].endpoint, '/api/follow-ups/followup/notes');
  assert.equal(app.requests[0].method, 'POST');
  assert.deepEqual(JSON.parse(app.requests[0].body), reschedule);
  assert.equal(app.state.drawer, null);
  const note = { note: 'Internal preparation.', customer_contacted: 'false', next_followup_days: 'none' };
  await app.submit('followup-module-note-form', note);
  assert.deepEqual(JSON.parse(app.requests[1].body), note);
  app.state.followupDetail.data.lifecycle_status = 'Completed';
  await app.submit('followup-module-reschedule-form', reschedule);
  assert.equal(app.requests[2].endpoint, '/api/customers/customer/notes');
});
