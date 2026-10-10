const test = require('node:test');
const assert = require('node:assert/strict');
const { CRM_ROLES, ROUTE_PERMISSIONS, canAccessRoute } = require('../../../../backend/security-utils');

test('auth permissions expose only the three final CRM roles and explicit route grants', () => {
  assert.deepEqual(CRM_ROLES, ['super_admin', 'sales_manager', 'sales_agent']);
  assert.equal(CRM_ROLES.includes('admin'), false);
  assert.equal(CRM_ROLES.includes('staff'), false);
  assert.equal(CRM_ROLES.includes('owner'), false);

  for (const route of ['dashboard', 'my-leads', 'customers', 'follow-ups', 'team-chat', 'my-account', 'change-password']) {
    assert.equal(canAccessRoute('sales_agent', route), true, `Sales Agent should access ${route}`);
  }

  assert.deepEqual(ROUTE_PERMISSIONS.settings, ['super_admin']);
  assert.deepEqual(ROUTE_PERMISSIONS['add-lead'], ['sales_manager']);
});
