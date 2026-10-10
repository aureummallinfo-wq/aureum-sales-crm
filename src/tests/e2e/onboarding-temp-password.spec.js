const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E temporary password onboarding forces password change before workspace access', async t => {
  const api = await startApiServer(t);
  const admin = await api.login('admin@aureum.com');
  const email = `qa.onboarding.${Date.now()}@aureum.com`;
  const temporaryPassword = 'TempAureum123!';
  const permanentPassword = 'PermanentAureum123!';

  const created = await api.request('/api/users', {
    method: 'POST',
    headers: { cookie: admin, 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'QA Temporary User',
      email,
      phone: '0300-2223334',
      role: 'sales_agent',
      teamId: 'team_a',
      status: 'Active',
      temporaryPassword,
      sendAccessEmail: false,
      requirePasswordChangeOnFirstLogin: true
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.user.mustChangePassword, true);

  const tempCookie = await api.login(email, temporaryPassword);
  const blockedDashboard = await api.request('/api/dashboard/summary', { headers: { cookie: tempCookie } });
  assert.equal(blockedDashboard.response.status, 403);
  assert.equal(blockedDashboard.body.code, 'PASSWORD_CHANGE_REQUIRED');

  const changed = await api.request('/api/account/change-password', {
    method: 'POST',
    headers: { cookie: tempCookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      currentPassword: temporaryPassword,
      newPassword: permanentPassword,
      confirmPassword: permanentPassword
    })
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.mustChangePassword, false);

  const dashboard = await api.request('/api/dashboard/summary', { headers: { cookie: tempCookie } });
  assert.equal(dashboard.response.status, 200);
});
