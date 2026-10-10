const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessRoute } = require('../../helpers/security-fixtures');

test('My Account and Change Password remain available to every authenticated CRM role', () => {
  for (const role of ['super_admin', 'sales_manager', 'sales_agent']) {
    assert.equal(canAccessRoute(role, 'my-account'), true);
    assert.equal(canAccessRoute(role, 'change-password'), true);
  }
});
