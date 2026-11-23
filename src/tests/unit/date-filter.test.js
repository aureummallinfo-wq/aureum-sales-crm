const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function dateFilter() {
  const source = fs.readFileSync(path.join(__dirname, '../../../frontend/shared/date-filter.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, Intl, Date, String, Object, Array, Boolean, Number, RegExp });
  return window.AureumDateFilter;
}

test('date filter exposes stable CRM date bounds for built-in ranges', () => {
  const filter = dateFilter();
  const today = filter.bounds('today', '', '');
  assert.equal(today.start, filter.today());
  assert.equal(today.end, filter.today());
  const week = filter.bounds('this_week', '', '');
  assert.match(week.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(week.end, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(week.start <= week.end);
});

test('custom date range normalizes reversed dates and ignores malformed input', () => {
  const filter = dateFilter();
  const custom = filter.bounds('custom', '2026-11-21', '2026-11-01');
  assert.equal(custom.start, '2026-11-01');
  assert.equal(custom.end, '2026-11-21');
  assert.equal(filter.query('custom', 'not-a-date', ''), null);
  assert.equal(filter.query('all', '', ''), null);
});
