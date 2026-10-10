const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E access control blocks direct API bypasses for each final CRM role', async t => {
  const api = await startApiServer(t);
  const admin = await api.login('admin@aureum.com');
  const manager = await api.login('manager@aureum.com');
  const agent = await api.login('advisor@aureum.com');

  const protectedWithoutSession = await api.request('/api/dashboard/summary');
  assert.equal(protectedWithoutSession.response.status, 401);

  for (const route of ['/api/dashboard/summary', '/api/leads/my', '/api/customers/my', '/api/follow-ups/my', '/api/chat/channels', '/api/account/me']) {
    const result = await api.request(route, { headers: { cookie: agent } });
    assert.equal(result.response.status, 200, `Sales Agent should access ${route}`);
  }

  for (const route of ['/api/leads', '/api/reports/summary', '/api/users', '/api/settings', '/api/settings/webhooks']) {
    const result = await api.request(route, { headers: { cookie: agent } });
    assert.equal(result.response.status, 403, `Sales Agent must be blocked from ${route}`);
  }

  const managerSettings = await api.request('/api/settings', { headers: { cookie: manager } });
  assert.equal(managerSettings.response.status, 403);

  const managerReports = await api.request('/api/reports/summary', { headers: { cookie: manager } });
  assert.equal(managerReports.response.status, 200);

  const adminSettings = await api.request('/api/settings', { headers: { cookie: admin } });
  assert.equal(adminSettings.response.status, 200);

  const agentOtherLead = await api.request('/api/leads/lead_003', { headers: { cookie: agent } });
  assert.equal(agentOtherLead.response.status, 403);
  assert.match(agentOtherLead.body.error, /ownership scope/i);
});
