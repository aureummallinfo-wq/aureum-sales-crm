const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function portal(role = 'SALES_AGENT') {
  const timers = new Map();
  const intervals = new Map();
  const requests = [];
  const data = {
    '/api/leads/my': [{ status: 'New' }, { status: 'Contacted' }],
    '/api/leads': [{ status: 'New' }, { status: 'New' }],
    '/api/follow-ups/my': [
      { status: 'Pending' }, { status: 'Overdue' }, { status: 'Rescheduled' },
      { status: 'Contacted', lifecycle_status: 'Completed' },
      { status: 'Cancelled' }, { status: 'Completed' },
      { status: 'Pending', completed_at: '2026-10-19T10:00:00Z' }
    ],
    '/api/tasks': [{ status: 'Pending' }, { status: 'In Progress' }, { status: 'Overdue' }, { status: 'Completed' }, { status: 'Cancelled' }],
    '/api/chat/unread-counts': { total: 4 }
  };
  data['/api/follow-ups'] = data['/api/follow-ups/my'];
  let timerId = 0;
  const document = {
    hidden: false, documentElement: { dataset: {}, style: {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}
  };
  const context = vm.createContext({
    window: {
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
      setInterval(fn, delay) { const id = ++timerId; intervals.set(id, { fn, delay }); return id; },
      clearInterval(id) { intervals.delete(id); },
      addEventListener() {}, history: { replaceState() {} }
    },
    document, localStorage: { getItem: () => null }, AbortController, URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, method: options.method || 'GET' });
      return { ok: true, status: 200, json: async () => ({ data: data[url] || [] }) };
    }
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../../frontend/app-shell.js'), 'utf8') + '\nglobalThis.portalState = state;', context);
  context.portalState.authUser = { id: 'agent-a', role: role.toLowerCase(), workspace_id: 'workspace-a' };
  context.portalState.role = role;
  context.portalState.ready = true;
  return {
    context, state: context.portalState, data, requests, document, timers, intervals,
    async refresh() { context.ensureSidebarBadges(); await context.refreshSidebarCounts(); },
    async runQueuedRefresh() {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === 150);
      assert.ok(entry, 'a refresh should be scheduled');
      timers.delete(entry[0]);
      await entry[1].fn();
    }
  };
}

test('sidebar counts open work using lifecycle status and shows it on every screen', async () => {
  const app = portal();
  await app.refresh();
  assert.equal(app.state.sidebarCounts['follow-ups'], 3);
  assert.equal(app.state.sidebarCounts.tasks, 3);
  assert.equal(app.state.sidebarCounts['my-leads'], 1);
  assert.equal(app.state.sidebarCounts['team-chat'], 4);
  app.state.screen = 'customers';
  const navigation = app.context.renderSidebarNavigation();
  assert.match(navigation, /aria-label="Follow-ups, 3 open follow-ups"/);
  assert.match(navigation, /aria-label="Tasks, 3 unfinished tasks"/);
  assert.match(navigation, /aria-label="Team Chat, 4 unread messages"/);
  assert.equal(app.requests.some(request => request.url === '/api/leads'), false);
});

test('filtered task and lead responses cannot change the overall navigation counts', async () => {
  const app = portal('SALES_MANAGER');
  await app.refresh();
  app.data['/api/tasks?status=Completed'] = [{ status: 'Completed' }];
  app.data['/api/leads/my?q=missing'] = [];
  await app.context.apiFetch('/api/tasks?status=Completed');
  await app.context.apiFetch('/api/leads/my?q=missing');
  assert.equal(app.state.sidebarCounts.tasks, 3);
  assert.equal(app.state.sidebarCounts['my-leads'], 1);
  assert.equal(app.state.sidebarCounts.leads, 2);
  assert.ok(app.requests.some(request => request.url === '/api/follow-ups'));
  assert.equal(app.requests.some(request => request.url === '/api/follow-ups/my'), false);
});

test('completing work and reading chat refreshes badges without rerendering the page', async () => {
  const app = portal();
  let renders = 0;
  app.context.render = () => { renders += 1; };
  await app.refresh();
  app.data['/api/tasks'] = [{ status: 'Completed' }];
  await app.context.apiFetch('/api/tasks/task-a', { method: 'PATCH' });
  await app.runQueuedRefresh();
  assert.equal(app.state.sidebarCounts.tasks, 0);
  app.data['/api/chat/unread-counts'] = { total: 0 };
  await app.context.apiFetch('/api/chat/channels/general/messages?markRead=1');
  await app.runQueuedRefresh();
  assert.equal(app.state.sidebarCounts['team-chat'], 0);
  assert.equal(renders, 0);
});

test('badge updates change the existing sidebar elements and retain exact accessible counts', async () => {
  const app = portal();
  const badge = {};
  const button = { dataset: { screen: 'team-chat' }, querySelector: () => badge, setAttribute(key, value) { this[key] = value; } };
  app.document.querySelectorAll = () => [button];
  app.data['/api/chat/unread-counts'] = { total: 130 };
  await app.context.apiFetch('/api/chat/unread-counts');
  assert.equal(badge.textContent, '99+');
  assert.equal(badge.hidden, false);
  assert.equal(button['aria-label'], 'Team Chat, 130 unread messages');
  app.data['/api/chat/unread-counts'] = { total: 0 };
  await app.context.apiFetch('/api/chat/unread-counts');
  assert.equal(badge.hidden, true);
  assert.equal(button['aria-label'], 'Team Chat');
});

test('transient API failures retain the last known badge counts', async () => {
  const app = portal();
  await app.refresh();
  app.context.apiInvalidateCache();
  app.context.fetch = async () => { throw new Error('Temporary network failure'); };
  await app.refresh();
  assert.equal(app.state.sidebarCounts['follow-ups'], 3);
  assert.equal(app.state.sidebarCounts.tasks, 3);
});

test('a mutation during polling forces a fresh count after the older response completes', async () => {
  const app = portal();
  const fetch = app.context.fetch;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  app.context.fetch = async (url, options) => {
    const response = await fetch(url, options);
    const body = await response.json();
    if (options.method !== 'PATCH') await pending;
    return { ...response, json: async () => body };
  };
  app.context.ensureSidebarBadges();
  const loading = app.context.refreshSidebarCounts();
  await new Promise(resolve => setImmediate(resolve));
  app.data['/api/tasks'] = [{ status: 'Completed' }];
  await app.context.apiFetch('/api/tasks/task-a', { method: 'PATCH' });
  release();
  await loading;
  app.context.fetch = fetch;
  await app.runQueuedRefresh();
  assert.equal(app.state.sidebarCounts.tasks, 0);
});

test('account changes stop polling and late responses cannot populate another user’s badges', async () => {
  const app = portal();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  app.context.fetch = async () => { await pending; return { ok: true, status: 200, json: async () => ({ data: [{ status: 'Pending' }] }) }; };
  app.context.ensureSidebarBadges();
  const loading = app.context.refreshSidebarCounts();
  assert.equal(app.intervals.size, 1);
  app.state.authUser = { id: 'agent-b', role: 'sales_agent', workspace_id: 'workspace-b' };
  assert.equal(app.intervals.size, 0);
  assert.equal([...app.timers.values()].some(timer => timer.delay === 150), false);
  release();
  await loading;
  assert.equal(Object.keys(app.state.sidebarCounts).length, 0);
});

test('polling skips hidden tabs and resumes with the current signed-in user', async () => {
  const app = portal();
  await app.refresh();
  app.context.apiInvalidateCache();
  const poll = [...app.intervals.values()][0];
  assert.equal(poll.delay, 30000);
  app.document.hidden = true;
  const previousRequests = app.requests.length;
  poll.fn();
  assert.equal(app.requests.length, previousRequests);
  app.document.hidden = false;
  app.data['/api/tasks'] = [];
  poll.fn();
  await app.context.refreshSidebarCounts();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.state.sidebarCounts.tasks, 0);
});
