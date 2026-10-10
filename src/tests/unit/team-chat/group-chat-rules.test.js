const test = require('node:test');
const assert = require('node:assert/strict');

test('group chat creation is limited to Super Admin and Sales Manager roles', () => {
  const canCreateGroup = role => ['super_admin', 'sales_manager'].includes(role);
  assert.equal(canCreateGroup('super_admin'), true);
  assert.equal(canCreateGroup('sales_manager'), true);
  assert.equal(canCreateGroup('sales_agent'), false);
  assert.equal(canCreateGroup('unknown'), false);
});
