const test = require('node:test'); const assert = require('node:assert/strict'); const { validatePasswordPolicy } = require('../helpers/security-fixtures');
test('auth functional coverage includes password policy', () => assert.equal(validatePasswordPolicy('Aureum123!'), true));
