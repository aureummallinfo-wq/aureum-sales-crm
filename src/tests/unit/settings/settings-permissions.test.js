const test = require('node:test'); const assert = require('node:assert/strict'); const { canAccessRoute } = require('../../helpers/security-fixtures');
test('settings are Super Admin only', () => { assert.equal(canAccessRoute('super_admin', 'settings'), true); assert.equal(canAccessRoute('sales_manager', 'settings'), false); assert.equal(canAccessRoute('sales_agent', 'settings'), false); });
