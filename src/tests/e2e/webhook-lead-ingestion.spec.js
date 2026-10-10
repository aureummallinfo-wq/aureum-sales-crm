const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E webhook lead ingestion validates secret, creates one imported lead, detects duplicates, and records failures', async t => {
  const api = await startApiServer(t);
  const admin = await api.login('admin@aureum.com');
  const manager = await api.login('manager@aureum.com');
  const agent = await api.login('advisor@aureum.com');

  const created = await api.request('/api/settings/webhooks', {
    method: 'POST',
    headers: { cookie: admin, 'content-type': 'application/json' },
    body: JSON.stringify({
      connectionName: 'Webhook QA Intake',
      sourceType: 'meta_lead_ads',
      sourcePlatform: 'meta',
      defaultLeadSource: 'Meta Lead Ads',
      defaultLeadStatus: 'New'
    })
  });
  assert.equal(created.response.status, 201);
  const connectionId = created.body.data.id;
  const secret = created.body.secretToken;

  const enabled = await api.request(`/api/settings/webhooks/${connectionId}/enable`, {
    method: 'PATCH',
    headers: { cookie: admin, 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(enabled.response.status, 200);

  const missingSecret = await api.request(`/api/webhooks/leads/${connectionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ full_name: 'Secretless Lead', phone: '0300-9998888' })
  });
  assert.equal(missingSecret.response.status, 401);

  const payload = {
    external_lead_id: `meta-${Date.now()}`,
    full_name: 'Webhook Imported Lead',
    phone: '0300-9998888',
    email: 'webhook.imported@example.com',
    interested_in: '1 Bed Apartment'
  };
  const imported = await api.request(`/api/webhooks/leads/${connectionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aureum-webhook-secret': secret },
    body: JSON.stringify(payload)
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.body.duplicate, false);

  const duplicate = await api.request(`/api/webhooks/leads/${connectionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aureum-webhook-secret': secret },
    body: JSON.stringify(payload)
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.duplicate, true);

  const managerImported = await api.request('/api/leads?imported=unassigned', { headers: { cookie: manager } });
  assert.equal(managerImported.response.status, 200);
  assert.ok(managerImported.body.data.some(lead => lead.id === imported.body.leadId));

  const agentLeads = await api.request('/api/leads/my', { headers: { cookie: agent } });
  assert.equal(agentLeads.body.data.some(lead => lead.id === imported.body.leadId), false);

  const failed = await api.request(`/api/webhooks/leads/${connectionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aureum-webhook-secret': secret },
    body: JSON.stringify({ campaign_name: 'Missing identity campaign' })
  });
  assert.equal(failed.response.status, 422);

  const failedInbox = await api.request('/api/settings/webhooks/failed-leads', { headers: { cookie: admin } });
  assert.equal(failedInbox.response.status, 200);
  assert.ok(failedInbox.body.data.some(item => item.id === failed.body.failedLeadId));
});
