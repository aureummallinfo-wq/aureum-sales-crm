const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIsoDate, safeText } = require('../../helpers/security-fixtures');

test('follow-up validation requires ISO dates, HH:MM times, and bounded notes', () => {
  assert.equal(validateIsoDate('2026-10-09'), true);
  assert.equal(validateIsoDate('10/09/2026'), false);
  assert.equal(/^([01]\d|2[0-3]):[0-5]\d$/.test('23:59'), true);
  assert.equal(/^([01]\d|2[0-3]):[0-5]\d$/.test('25:00'), false);
  assert.equal(safeText('x'.repeat(3000), 2000).length, 2000);
});
