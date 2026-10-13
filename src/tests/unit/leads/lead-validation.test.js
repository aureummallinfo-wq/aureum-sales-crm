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

test('lead validation accepts common international phone formats', () => {
  for (const phone of [
    '+44 20 7946 0958',
    '+1 (212) 555-0123',
    '+92 300 1234567',
    '+971 50 123 4567',
    '+44 20 7946 0958 ext 123',
  ]) {
    assert.equal(validatePhone(phone), true, phone);
  }

  assert.equal(validatePhone('123'), false);
  assert.equal(validatePhone('+44 ABC 123'), false);
});
