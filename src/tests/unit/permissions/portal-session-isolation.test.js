const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../..');
const agent = (id, workspace = 'workspace-a') => ({ id, workspace_id: workspace, role: 'sales_agent', team_id: 'team-a' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = body => ({ ok: true, status: 200, json: async () => body });

function portal() {
  const context = vm.createContext({
    window: { setTimeout, clearTimeout, setInterval: () => 1, history: { replaceState() {} } },
    document: { querySelector() {}, addEventListener() {} },
    fetch: async () => response({ data: [] }), AbortController, URLSearchParams, console
  });
  const source = fs.readFileSync(path.join(root, 'frontend/app-shell.js'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('/* Personal display preferences')) + '\nglobalThis.portalState = state;', context);
  context.portalState.authUser = agent('agent-a');
  context.portalState.role = 'SALES_AGENT';
  return context;
}

test('account changes clear sales records, details, searches and cached requests', async () => {
  const context = portal();
  let requests = 0;
  context.fetch = async () => { requests += 1; return response({ data: [{ id: context.portalState.authUser.id }] }); };
  const first = await context.apiFetch('/api/follow-ups/my', { cacheTtl: 30000 });
  context.portalState.followups.items = first.data;
  context.portalState.customerDetail = { full_name: 'Private customer' };
  context.portalState.globalSearch.results = { leads: [{ full_name: 'Private lead' }] };
  await context.apiFetch('/api/follow-ups/my', { cacheTtl: 30000 });
  assert.equal(requests, 1);
  const firstKey = context.apiCacheKey('/api/follow-ups/my');

  context.portalState.authUser = agent('agent-b');
  assert.equal(context.portalState.followups.items.length, 0);
  assert.equal(context.portalState.customerDetail, null);
  assert.equal(context.portalState.globalSearch.results, null);
  assert.notEqual(context.apiCacheKey('/api/follow-ups/my'), firstKey);
  const second = await context.apiFetch('/api/follow-ups/my', { cacheTtl: 30000 });
  assert.equal(second.data[0].id, 'agent-b');
  assert.equal(requests, 2);
});

test('workspace, team and role changes invalidate scope; ordinary profile edits preserve it', () => {
  const context = portal();
  const state = context.portalState;
  state.followups.items = [{ id: 'mine' }];
  const initialKey = context.apiCacheKey('/api/follow-ups/my');
  state.authUser = { ...state.authUser, full_name: 'Updated name' };
  assert.equal(context.apiCacheKey('/api/follow-ups/my'), initialKey);
  assert.equal(state.followups.items.length, 1);
  for (const change of [{ workspace_id: 'workspace-b' }, { team_id: 'team-b' }, { role: 'sales_manager' }]) {
    const previousKey = context.apiCacheKey('/api/follow-ups/my');
    state.followups.items = [{ id: 'previous-scope' }];
    state.authUser = { ...state.authUser, ...change };
    assert.notEqual(context.apiCacheKey('/api/follow-ups/my'), previousKey);
    assert.equal(state.followups.items.length, 0);
  }
});

test('a request from a signed-out account cannot return data or refill the cache', async () => {
  const context = portal();
  const pending = deferred();
  context.fetch = () => pending.promise;
  const request = context.apiFetch('/api/leads/my', { cacheTtl: 30000 });
  context.portalState.authUser = null;
  context.portalState.authUser = agent('agent-a');
  pending.resolve(response({ data: [{ full_name: 'Old session customer' }] }));
  await assert.rejects(request, /account changed/);
  let requests = 0;
  context.fetch = async () => { requests += 1; return response({ data: [] }); };
  await context.apiFetch('/api/leads/my', { cacheTtl: 30000 });
  assert.equal(requests, 1);
});

test('an old unauthorized response cannot sign a different agent out', async () => {
  const context = portal();
  const pending = deferred();
  context.fetch = () => pending.promise;
  const request = context.apiFetch('/api/customers/my');
  context.portalState.authUser = agent('agent-b');
  pending.resolve({ ok: false, status: 401, json: async () => ({ error: 'Expired' }) });
  await assert.rejects(request, /account changed/);
  assert.equal(context.portalState.authUser.id, 'agent-b');
});

test('requests identify the displayed account and a changed cookie clears the portal', async () => {
  const context = portal();
  context.portalState.followups.items = [{ id: 'private-followup' }];
  context.fetch = async (url, options) => {
    assert.equal(options.headers['X-Aureum-Portal-Scope'], JSON.stringify(['workspace-a', 'agent-a', 'sales_agent', 'team-a']));
    return { ok: false, status: 409, json: async () => ({ code: 'PORTAL_SESSION_CHANGED', error: 'Account changed' }) };
  };
  await assert.rejects(context.apiFetch('/api/follow-ups/my'), /Account changed/);
  assert.equal(context.portalState.authUser, null);
  assert.equal(context.portalState.screen, 'login');
  assert.equal(context.portalState.followups.items.length, 0);
  assert.match(context.portalState.loginError, /account for this tab changed/i);
});

test('dashboard rejects an older account response after the new account has loaded', async () => {
  const context = portal();
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend/features/dashboard/dashboard-module.js'), 'utf8'), context);
  context.render = () => {};
  const pendingA = deferred(); const pendingB = deferred();
  context.apiFetch = async endpoint => {
    if (endpoint.includes('/presence/')) return {};
    const owner = context.portalState.authUser.id;
    await (owner === 'agent-a' ? pendingA.promise : pendingB.promise);
    return { data: endpoint.includes('/summary') ? { totalLeads: owner === 'agent-a' ? 9 : 1 } : [{ id: owner, customer_name: owner }] };
  };
  const requestA = context.loadDashboard();
  context.portalState.authUser = agent('agent-b');
  const requestB = context.loadDashboard();
  assert.equal(context.portalState.dashboard.data, null);
  pendingB.resolve(); await requestB;
  pendingA.resolve(); await requestA;
  assert.equal(context.portalState.dashboard.data.summary.totalLeads, 1);
  assert.equal(context.portalState.dashboard.data.todayFollowUps[0].customerName, 'agent-b');
});

test('dashboard cache cannot cross accounts or workspaces', () => {
  const context = portal();
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend/features/dashboard/dashboard-module.js'), 'utf8'), context);
  context.dashboardWriteCache(context.normalizeDashboardData({ summary: { totalLeads: 9 } }));
  assert.equal(context.dashboardReadCache().summary.totalLeads, 9);
  context.portalState.authUser = agent('agent-b');
  assert.equal(context.dashboardReadCache(), null);
  context.dashboardWriteCache(context.normalizeDashboardData({ summary: { totalLeads: 1 } }));
  context.portalState.authUser = agent('agent-b', 'workspace-b');
  assert.equal(context.dashboardReadCache(), null);
});
