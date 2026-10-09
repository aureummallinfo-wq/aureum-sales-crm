const test = require('node:test'); const assert = require('node:assert/strict'); const { canAccessRoute } = require('../../helpers/security-fixtures');
test('users management stays unavailable to sales agents', () => { assert.equal(canAccessRoute('sales_agent', 'users'), false); assert.equal(canAccessRoute('sales_manager', 'users'), true); });
