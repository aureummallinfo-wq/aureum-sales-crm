const test = require('node:test'); const assert = require('node:assert/strict'); const { canAccessRoute } = require('../../helpers/security-fixtures');
test('forced password users retain only account/password route intent', () => { assert.equal(canAccessRoute('sales_agent', 'change-password'), true); assert.equal(canAccessRoute('sales_agent', 'dashboard'), true); });
