const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

async function jsonRequest(api, route, cookie, method, body) {
  return api.request(route, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('all CRM roles can edit permitted records and add mobile notes', async t => {
  const api = await startApiServer(t);
  const roles = ['admin@aureum.com', 'manager@aureum.com', 'advisor@aureum.com'];

  for (const identifier of roles) {
    const cookie = await api.login(identifier);
    const suffix = identifier.split('@')[0];

    const leadEdit = await jsonRequest(api, '/api/leads/lead_001', cookie, 'PATCH', { area: `Mobile QA ${suffix}` });
    assert.equal(leadEdit.response.status, 200);
    const leadNote = await jsonRequest(api, '/api/leads/lead_001/notes', cookie, 'POST', { note: `Mobile lead note ${suffix}` });
    assert.equal(leadNote.response.status, 201);

    const customerEdit = await jsonRequest(api, '/api/customers/customer_001', cookie, 'PATCH', { area: `Mobile QA ${suffix}` });
    assert.equal(customerEdit.response.status, 200);
    const customerNote = await jsonRequest(api, '/api/customers/customer_001/notes', cookie, 'POST', { note: `Mobile customer note ${suffix}` });
    assert.equal(customerNote.response.status, 201);

    const followUpEdit = await jsonRequest(api, '/api/follow-ups/followup_001', cookie, 'PATCH', { due_date: '2026-10-10', due_time: '10:30', priority: 'High', notes: `Mobile follow-up note ${suffix}` });
    assert.equal(followUpEdit.response.status, 200);
    const followUpNote = await jsonRequest(api, '/api/follow-ups/followup_001/notes', cookie, 'POST', { note: `Mobile activity note ${suffix}` });
    assert.equal(followUpNote.response.status, 201);

    const notifications = await api.request('/api/notifications', { headers: { cookie } });
    assert.equal(notifications.response.status, 200);
    assert.ok(notifications.body.data.length > 0);
    const read = await api.request(`/api/notifications/${notifications.body.data[0].id}/read`, { method: 'PATCH', headers: { cookie } });
    assert.equal(read.response.status, 200);
    const readAll = await api.request('/api/notifications/read-all', { method: 'PATCH', headers: { cookie } });
    assert.equal(readAll.response.status, 200);
    const afterReadAll = await api.request('/api/notifications', { headers: { cookie } });
    assert.equal(afterReadAll.body.unread, 0);
  }
});
