const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessRoute } = require('../../helpers/security-fixtures');

test('final route matrix matches the approved five-position access model', () => {
  const matrix = {
    super_admin: ['dashboard', 'all-leads', 'my-leads', 'add-lead', 'customers', 'follow-ups', 'tasks', 'team-chat', 'reports', 'users', 'settings', 'my-account', 'change-password', 'access-denied'],
    sales_manager: ['dashboard', 'all-leads', 'my-leads', 'add-lead', 'customers', 'follow-ups', 'tasks', 'team-chat', 'reports', 'users', 'my-account', 'change-password', 'access-denied'],
    sales_agent: ['dashboard', 'my-leads', 'add-lead', 'customers', 'follow-ups', 'tasks', 'team-chat', 'my-account', 'change-password', 'access-denied'],
    hr: ['dashboard', 'follow-ups', 'tasks', 'reports', 'my-account', 'change-password', 'access-denied'],
    project_manager: ['dashboard', 'tasks', 'team-chat', 'reports', 'my-account', 'change-password', 'access-denied']
  };

  const protectedRoutes = ['dashboard', 'all-leads', 'my-leads', 'add-lead', 'customers', 'follow-ups', 'tasks', 'team-chat', 'reports', 'users', 'settings', 'my-account', 'change-password', 'access-denied'];
  for (const [role, allowed] of Object.entries(matrix)) {
    for (const route of protectedRoutes) {
      assert.equal(canAccessRoute(role, route), allowed.includes(route), `${role} route ${route}`);
    }
  }
});
