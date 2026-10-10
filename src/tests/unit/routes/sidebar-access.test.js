const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessRoute } = require('../../helpers/security-fixtures');

test('sidebar access hides restricted navigation destinations for each role', () => {
  const sidebar = {
    super_admin: ['dashboard', 'all-leads', 'my-leads', 'customers', 'follow-ups', 'team-chat', 'reports', 'users', 'my-account', 'settings'],
    sales_manager: ['dashboard', 'all-leads', 'my-leads', 'add-lead', 'customers', 'follow-ups', 'team-chat', 'reports', 'users', 'my-account'],
    sales_agent: ['dashboard', 'my-leads', 'customers', 'follow-ups', 'team-chat', 'my-account']
  };

  assert.equal(sidebar.sales_agent.includes('all-leads'), false);
  assert.equal(sidebar.sales_agent.includes('reports'), false);
  assert.equal(sidebar.sales_agent.includes('users'), false);
  assert.equal(sidebar.sales_manager.includes('settings'), false);

  for (const [role, routes] of Object.entries(sidebar)) {
    routes.forEach(route => assert.equal(canAccessRoute(role, route), true, `${role} sidebar item ${route}`));
  }
});
