const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEmail, validatePhone, safeText } = require('../../helpers/security-fixtures');

test('lead validation accepts useful contact data and strips unsafe control characters', () => {
  assert.equal(validateEmail('client@example.com'), true);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validatePhone('0300-1234567'), true);
  assert.equal(validatePhone('abc123'), false);
  assert.equal(safeText('  Ahmed\u0000 Khan  '), 'Ahmed Khan');
});
