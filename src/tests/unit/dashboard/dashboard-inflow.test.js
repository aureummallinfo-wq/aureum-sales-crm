const test = require('node:test');
const assert = require('node:assert/strict');
const { createRelationalApi } = require('../../../../backend/db/relational-api');

const manager = { id: 'manager-1', role: 'sales_manager', team_id: 'team-a' };
const users = [
  { id: 'manager-1', role: 'sales_manager', team_id: 'team-a', team_name: 'Team A', full_name: 'Dua Rana', status: 'active' },
  { id: 'agent-1', role: 'sales_agent', team_id: 'team-a', team_name: 'Team A', full_name: 'Adan Abdul Rehman', status: 'active' }
];

function makeApi(leads) {
  const response = {};
  const repository = {
    listUsers: async () => users,
    listLeads: async () => leads,
    listCustomers: async () => [],
    listFollowUps: async () => []
  };
  const api = createRelationalApi({
    repository,
    workspaceId: 'workspace-1',
    json: (res, status, payload) => { res.statusCode = status; res.payload = payload; return true; },
    readBody: async () => ({}),
    readBodyLimited: async () => ({}),
    safeText: value => String(value || ''),
    validateEmail: () => true,
    validatePhone: () => true,
    validateIsoDate: () => true,
    passwordHash: async value => value,
    passwordPolicySatisfied: () => true,
    leadView: value => value,
    customerView: value => value,
    followUpView: value => value,
    publicUser: value => value,
    userManagementView: value => value,
    notificationView: value => value,
    rolePermissions: {},
    crmTimezone: 'Asia/Karachi'
  });
  return { api, response };
}

function makeSummaryApi(leads, customers) {
  const response = {};
  const repository = {
    listUsers: async () => users,
    listLeads: async () => leads,
    listCustomers: async () => customers,
    listFollowUps: async () => []
  };
  const api = createRelationalApi({
    repository,
    workspaceId: 'workspace-1',
    json: (res, status, payload) => { res.statusCode = status; res.payload = payload; return true; },
    readBody: async () => ({}),
    readBodyLimited: async () => ({}),
    safeText: value => String(value || ''),
    validateEmail: () => true,
    validatePhone: () => true,
    validateIsoDate: () => true,
    passwordHash: async value => value,
    passwordPolicySatisfied: () => true,
    leadView: value => value,
    customerView: value => value,
    followUpView: value => value,
    publicUser: value => value,
    userManagementView: value => value,
    notificationView: value => value,
    rolePermissions: {},
    crmTimezone: 'Asia/Karachi'
  });
  return { api, response };
}

async function leadInflow(params, leads) {
  const { api, response } = makeApi(leads);
  await api.handle({ method: 'GET' }, response, new URL(`https://crm.test/api/dashboard/lead-inflow?${new URLSearchParams(params)}`), manager);
  assert.equal(response.statusCode, 200);
  return response.payload.data;
}

test('This Month returns daily zero-filled buckets', async () => {
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit' }).format(new Date());
  const leads = [
    { id: 'lead-1', assigned_agent_id: 'agent-1', created_at: `${month}-07T10:00:00+05:00`, status: 'New', lead_source: 'Website' },
    { id: 'lead-2', assigned_agent_id: 'agent-1', created_at: `${month}-08T10:00:00+05:00`, status: 'New', lead_source: 'Website' }
  ];
  const points = await leadInflow({ dateRange: 'this_month' }, leads);
  assert.ok(points.length >= 28 && points.length <= 31);
  assert.equal(points[0].label, `${month}-01`);
  assert.equal(points.find(point => point.label === `${month}-07`).leads, 1);
  assert.equal(points.find(point => point.label === `${month}-08`).leads, 1);
  assert.equal(points.find(point => point.label === `${month}-09`).leads, 0);
});

test('custom ranges include missing days with zero values', async () => {
  const points = await leadInflow({ dateRange: 'custom', startDate: '2026-10-07', endDate: '2026-10-09' }, [
    { id: 'lead-1', assigned_agent_id: 'agent-1', created_at: '2026-10-07', status: 'New', lead_source: 'Website' },
    { id: 'lead-2', assigned_agent_id: 'agent-1', created_at: '2026-10-09', status: 'New', lead_source: 'Website' }
  ]);
  assert.deepEqual(points, [
    { label: '2026-10-07', leads: 1 },
    { label: '2026-10-08', leads: 0 },
    { label: '2026-10-09', leads: 1 }
  ]);
});

test('Today uses hourly buckets when lead timestamps include time', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const points = await leadInflow({ dateRange: 'today' }, [
    { id: 'lead-1', assigned_agent_id: 'agent-1', created_at: `${today}T10:15:00+05:00`, status: 'New', lead_source: 'Website' }
  ]);
  assert.equal(points.length, 24);
  assert.equal(points.find(point => point.label.endsWith('T10:00')).leads, 1);
  assert.equal(points.filter(point => point.leads > 0).length, 1);
});

test('dashboard lead and customer totals use the same intake date and team scope', async () => {
  const { api, response } = makeSummaryApi([
    { id: 'lead-1', assigned_agent_id: 'agent-1', received_at: '2026-10-07T10:00:00+05:00', created_at: '2026-10-07T10:00:00+05:00', status: 'New', lead_source: 'Meta Lead Ads' }
  ], [
    // This customer was created later during reconciliation, but belongs to
    // the October lead and must appear in the same October dashboard range.
    { id: 'customer-1', assigned_agent_id: 'agent-1', lead_received_at: '2026-10-07T10:00:00+05:00', created_at: '2026-11-20T10:00:00+05:00', customer_status: 'New' }
  ]);
  await api.handle({ method: 'GET' }, response, new URL('https://crm.test/api/dashboard/summary?dateRange=custom&startDate=2026-10-01&endDate=2026-10-31'), manager);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.data.totalLeads, 1);
  assert.equal(response.payload.data.totalCustomers, 1);
  assert.equal(response.payload.data.activeCustomers, 1);
});
