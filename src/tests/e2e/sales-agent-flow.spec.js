const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E Sales Agent flow stays scoped to own leads, customers, follow-ups, and permitted chat', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('advisor@aureum.com');

  const myLeads = await api.request('/api/leads/my', { headers: { cookie } });
  assert.equal(myLeads.response.status, 200);
  assert.ok(myLeads.body.data.length > 0);
  assert.ok(myLeads.body.data.every(lead => lead.assigned_agent_id === 'usr_003'));

  const customers = await api.request('/api/customers/my', { headers: { cookie } });
  assert.equal(customers.response.status, 200);
  assert.ok(customers.body.data.every(customer => customer.assigned_agent_id === 'usr_003'));

  const followUps = await api.request('/api/follow-ups/my', { headers: { cookie } });
  assert.equal(followUps.response.status, 200);
  assert.ok(followUps.body.data.every(item => item.assigned_agent_id === 'usr_003'));

  const channels = await api.request('/api/chat/channels', { headers: { cookie } });
  assert.equal(channels.response.status, 200);
  assert.equal(channels.body.data.some(channel => channel.id === 'channel_management'), false);

  const groupCreate = await api.request('/api/chat/groups', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Agent Restricted Group', memberIds: ['usr_004'] })
  });
  assert.equal(groupCreate.response.status, 403);
});
