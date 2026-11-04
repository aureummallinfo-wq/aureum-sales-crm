const test = require('node:test');
const assert = require('node:assert/strict');
const { CRM_ROLES, ROUTE_PERMISSIONS, canAccessRoute } = require('../../../../backend/security-utils');

test('auth permissions expose the five canonical CRM roles and explicit route grants', () => {
  assert.deepEqual(CRM_ROLES, ['super_admin', 'sales_manager', 'sales_agent', 'hr', 'project_manager']);
  assert.equal(CRM_ROLES.includes('admin'), false);
  assert.equal(CRM_ROLES.includes('staff'), false);
  assert.equal(CRM_ROLES.includes('owner'), false);

  for (const route of ['dashboard', 'my-leads', 'customers', 'follow-ups', 'team-chat', 'my-account', 'change-password']) {
    assert.equal(canAccessRoute('sales_agent', route), true, `Sales Agent should access ${route}`);
  }

  assert.deepEqual(ROUTE_PERMISSIONS.settings, ['super_admin']);
  assert.deepEqual(ROUTE_PERMISSIONS['add-lead'], ['super_admin', 'sales_manager', 'sales_agent']);
  assert.equal(canAccessRoute('hr', 'tasks'), true);
  assert.equal(canAccessRoute('hr', 'all-leads'), false);
  assert.equal(canAccessRoute('project_manager', 'reports'), true);
  assert.equal(canAccessRoute('project_manager', 'customers'), false);
});
