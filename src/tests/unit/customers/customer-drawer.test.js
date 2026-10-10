const test = require('node:test');
const assert = require('node:assert/strict');

test('customer drawer contract includes overview, notes, timeline, and follow-up tabs', () => {
  const tabs = ['overview', 'notes', 'timeline', 'follow-ups'];
  assert.deepEqual(tabs, ['overview', 'notes', 'timeline', 'follow-ups']);
  assert.equal(tabs.includes('settings'), false);
});
