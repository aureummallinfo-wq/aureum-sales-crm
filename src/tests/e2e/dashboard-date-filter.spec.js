const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('dashboard date ranges recalculate metrics and preserve user scope', async t => {
  const api = await startApiServer(t);
  const manager = await api.login('manager@aureum.com');
  const agent = await api.login('advisor@aureum.com');

  const agentMonth = await api.request('/api/dashboard/summary?dateRange=this_month', { headers: { cookie: agent } });
  const agentToday = await api.request('/api/dashboard/summary?dateRange=today', { headers: { cookie: agent } });
  const managerMonth = await api.request('/api/dashboard/summary?dateRange=this_month', { headers: { cookie: manager } });
  const managerToday = await api.request('/api/dashboard/summary?dateRange=today', { headers: { cookie: manager } });
  const agentSources = await api.request('/api/dashboard/lead-sources?dateRange=this_month', { headers: { cookie: agent } });
  const managerSources = await api.request('/api/dashboard/lead-sources?dateRange=this_month', { headers: { cookie: manager } });
  const managerInflow = await api.request('/api/dashboard/lead-inflow?dateRange=custom&startDate=2026-10-05&endDate=2026-10-08', { headers: { cookie: manager } });

  assert.equal(agentMonth.response.status, 200);
  assert.equal(agentToday.response.status, 200);
  assert.equal(managerMonth.response.status, 200);
  assert.equal(managerToday.response.status, 200);
  assert.equal(agentMonth.body.data.totalLeads, 3);
  assert.equal(agentToday.body.data.totalLeads, 0);
  assert.equal(managerMonth.body.data.totalLeads, 6);
  assert.equal(managerToday.body.data.totalLeads, 0);
  assert.ok(managerMonth.body.data.totalLeads > agentMonth.body.data.totalLeads);
  assert.notDeepEqual(agentSources.body.data, managerSources.body.data);
  assert.equal(managerInflow.response.status, 200);
  assert.equal(managerInflow.body.data.reduce((sum, point) => sum + point.leads, 0), 6);
});

test('sales managers can edit, note, and schedule from a permitted customer profile', async t => {
  const api = await startApiServer(t);
  const manager = await api.login('manager@aureum.com');

  const jsonHeaders = { cookie: manager, 'content-type': 'application/json' };
  const updated = await api.request('/api/customers/customer_001', { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ area: 'DHA Phase 6' }) });
  const note = await api.request('/api/customers/customer_001/notes', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ note: 'Manager confirmed the next site-visit requirement.' }) });
  const followUp = await api.request('/api/customers/customer_001/follow-ups', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ type: 'Phone call', due_date: '2026-10-12', note: 'Confirm site visit timing.' }) });

  assert.equal(updated.response.status, 200);
  assert.equal(note.response.status, 201);
  assert.equal(followUp.response.status, 201);
  assert.equal(followUp.body.followUp.type, 'Phone call');
});
