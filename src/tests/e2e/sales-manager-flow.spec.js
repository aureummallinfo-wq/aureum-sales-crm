const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E Sales Manager flow can operate team pipeline but cannot cross into settings', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('manager@aureum.com');

  const leads = await api.request('/api/leads', { headers: { cookie } });
  assert.equal(leads.response.status, 200);
  assert.ok(leads.body.data.every(lead => lead.assigned_team_id === 'team_a' || lead.assigned_team_id === null));

  const createdLead = await api.request('/api/leads', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Manager QA Lead',
      phone: '0300-5551234',
      email: 'manager.qa@example.com',
      interested_in: 'Commercial Shop',
      lead_source: 'Manual Entry',
      status: 'New',
      assigned_agent_id: 'usr_003'
    })
  });
  assert.equal(createdLead.response.status, 201);
  assert.equal(createdLead.body.data.assigned_team_id, 'team_a');

  const users = await api.request('/api/users', { headers: { cookie } });
  assert.equal(users.response.status, 200);
  assert.ok(users.body.data.every(user => user.role === 'sales_agent' && user.teamId === 'team_a'));

  const outsideAgentReport = await api.request('/api/reports/agents/usr_006', { headers: { cookie } });
  assert.equal(outsideAgentReport.response.status, 404);

  const settings = await api.request('/api/settings/webhooks', { headers: { cookie } });
  assert.equal(settings.response.status, 403);
});

test('E2E Sales Manager can manage an accessible group created by another leader', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('manager@aureum.com');

  const rename = await api.request('/api/chat/groups/group_bookings', {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ groupName: 'Booking Discussion QA' })
  });
  assert.equal(rename.response.status, 200);
  assert.equal(rename.body.data.groupName, 'Booking Discussion QA');

  const add = await api.request('/api/chat/groups/group_bookings/members', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ memberIds: ['usr_004'] })
  });
  assert.equal(add.response.status, 200);
  assert.ok(add.body.data.memberIds.includes('usr_004'));

  const remove = await api.request('/api/chat/groups/group_bookings/members/usr_004', {
    method: 'DELETE',
    headers: { cookie }
  });
  assert.equal(remove.response.status, 200);
  assert.equal(remove.body.event, 'member_removed');

  const archive = await api.request('/api/chat/groups/group_bookings/archive', {
    method: 'PATCH',
    headers: { cookie }
  });
  assert.equal(archive.response.status, 200);
  assert.equal(archive.body.event, 'group_archived');
});
