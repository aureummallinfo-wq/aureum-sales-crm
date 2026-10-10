const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePhone, validatePasswordPolicy } = require('../../helpers/security-fixtures');

test('account validation allows profile phone updates and rejects weak password changes', () => {
  assert.equal(validatePhone('0300-0000003'), true);
  assert.equal(validatePhone('not a phone'), false);
  assert.equal(validatePasswordPolicy('Weakpass'), false);
  assert.equal(validatePasswordPolicy('Aureum123!'), true);
});
