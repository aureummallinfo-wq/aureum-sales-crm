const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessRoute } = require('../../helpers/security-fixtures');

test('reports are available to leadership roles and denied to Sales Agents', () => {
  assert.equal(canAccessRoute('super_admin', 'reports'), true);
  assert.equal(canAccessRoute('sales_manager', 'reports'), true);
  assert.equal(canAccessRoute('sales_agent', 'reports'), false);
});
