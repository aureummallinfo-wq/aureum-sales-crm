const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E Super Admin flow covers settings, reports, users, and masked webhook secrets', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('admin@aureum.com');

  const settings = await api.request('/api/settings', { headers: { cookie } });
  assert.equal(settings.response.status, 200);
  assert.ok(settings.body.data.security);

  const users = await api.request('/api/users', { headers: { cookie } });
  assert.equal(users.response.status, 200);
  assert.ok(users.body.data.some(user => user.role === 'sales_manager'));

  const reports = await api.request('/api/reports/summary', { headers: { cookie } });
  assert.equal(reports.response.status, 200);
  assert.ok(Number.isFinite(reports.body.data.conversionRate));

  const webhook = await api.request('/api/settings/webhooks', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      connectionName: 'Super Admin QA Webhook',
      sourceType: 'meta_lead_ads',
      sourcePlatform: 'meta'
    })
  });
  assert.equal(webhook.response.status, 201);
  assert.ok(webhook.body.secretToken.startsWith('aureum_wh_'));
  assert.equal(JSON.stringify(webhook.body.data).includes('secret_hash'), false);
  assert.equal(webhook.body.data.secretTokenMasked, '••••••••');
});
