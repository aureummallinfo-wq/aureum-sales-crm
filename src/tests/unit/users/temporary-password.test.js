const test = require('node:test'); const assert = require('node:assert/strict'); const { validatePasswordPolicy } = require('../../helpers/security-fixtures');
test('temporary password policy is not bypassed by short values', () => { assert.equal(validatePasswordPolicy('A1!shrt'), false); assert.equal(validatePasswordPolicy('Aureum123!'), true); });
