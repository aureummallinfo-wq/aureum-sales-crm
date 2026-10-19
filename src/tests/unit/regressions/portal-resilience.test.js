const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(), json: async () => body });

function portal(fetch, { timeout = setTimeout } = {}) {
  const app = { innerHTML: '' };
  const context = vm.createContext({
    console: { error() {} }, AbortController, URLSearchParams, fetch,
    window: { location: { pathname: '/follow-ups' }, setTimeout: timeout, clearTimeout, history: { replaceState() {} } },
    document: { querySelector: () => app, addEventListener() {} },
    bind() {}, ensureUsersEvents() {}, canAccess: () => true,
    layout: content => `<nav>Sidebar stays available</nav>${content}`,
    renderLogin: () => '<form>Sign in</form>', renderFollowups: () => '<p>Follow-ups loaded</p>',
    loadFollowups() {}
  });
  const shell = read('frontend/app-shell.js');
  vm.runInContext(shell.slice(0, shell.indexOf('/* Personal display preferences')) + '\nglobalThis.portalState = state;', context);
  // Exercise the actual final renderer/drawer router, after the settings layers.
  const team = read('frontend/team-chat-reports-agents.js');
  vm.runInContext(team.split('\n').filter(line => line.startsWith('function render()') || line.startsWith('function renderDrawer()')).join('\n'), context);
  const runtime = read('frontend/app-runtime.js');
  vm.runInContext(runtime.slice(runtime.indexOf('let portalBootPromise;'), runtime.indexOf('window.aureumFinalBind')), context);
  return { context, state: context.portalState, app };
}

test('a failing screen and dashboard renderer cannot take down Customers or the sidebar', () => {
  const { context, state, app } = portal(async () => response(200, {}));
  let dashboardCalls = 0;
  state.authUser = { id: 'user', role: 'sales_manager' };
  state.ready = true;
  state.screen = 'follow-ups';
  context.renderFollowups = () => { throw new TypeError('Private customer detail'); };
  context.renderDashboard = () => { dashboardCalls++; throw new TypeError('Broken dashboard'); };
  context.renderCustomers = () => '<p>Healthy customers</p>';
  context.render();
  assert.match(app.innerHTML, /Sidebar stays available/);
  assert.match(app.innerHTML, /data-retry-screen/);
  assert.doesNotMatch(app.innerHTML, /Private customer detail/);
  state.screen = 'customers';
  context.render();
  assert.match(app.innerHTML, /Healthy customers/);
  assert.equal(dashboardCalls, 0, 'inactive screens must never execute');
});

test('a broken record drawer has a close action and leaves its screen available', () => {
  const { context, state } = portal(async () => response(200, {}));
  state.drawer = 'customer';
  context.window.renderCustomerDrawer = () => { throw new Error('Sensitive customer data'); };
  const drawer = context.renderDrawer();
  assert.match(drawer, /data-recovery-close-drawer/);
  assert.doesNotMatch(drawer, /Sensitive customer data/);
});

test('a session-check outage shows recovery and retry restores the same requested screen', async () => {
  let requests = 0;
  const { context, state, app } = portal(async () => ++requests === 1
    ? response(503, { error: 'Database <unavailable>', code: 'DATABASE_UNAVAILABLE' })
    : response(200, { user: { id: 'same-session', role: 'sales_manager' } }));
  await context.boot();
  assert.match(app.innerHTML, /CRM temporarily unavailable/);
  assert.match(app.innerHTML, /Database &lt;unavailable&gt;/);
  assert.match(app.innerHTML, /data-retry-portal/);
  assert.doesNotMatch(app.innerHTML, /Sign in/);
  await context.window.aureumRetryPortal();
  assert.equal(state.authUser.id, 'same-session');
  assert.equal(state.screen, 'follow-ups');
  assert.match(app.innerHTML, /Follow-ups loaded/);
  assert.equal(requests, 2);
});

test('a genuinely expired session still requires sign-in', async () => {
  const { context, state, app } = portal(async () => response(401, { error: 'Authentication required' }));
  await context.boot();
  assert.equal(state.authUser, null);
  assert.equal(state.screen, 'login');
  assert.match(app.innerHTML, /Sign in/);
});

test('identical simultaneous saves share one request and failed writes are never replayed', async () => {
  let requests = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { context } = portal(async () => { requests++; return pending; });
  const save = () => context.apiFetch('/api/customers/one/notes', { method: 'POST', body: '{"note":"Same note"}' });
  const first = save();
  const second = save();
  assert.equal(requests, 1);
  finish(response(503, { error: 'Save not confirmed', code: 'SAVE_UNCONFIRMED' }));
  const results = await Promise.allSettled([first, second]);
  results.forEach(result => { assert.equal(result.status, 'rejected'); assert.equal(result.reason.code, 'SAVE_UNCONFIRMED'); });
  assert.equal(requests, 1);
});

test('response body stalls time out without signing the current user out', async () => {
  const { context, state } = portal(async (url, options) => ({
    ok: true, status: 200,
    json: () => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
  }), { timeout: callback => setTimeout(callback, 15) });
  state.authUser = { id: 'current-user', role: 'sales_agent' };
  await assert.rejects(context.apiFetch('/api/customers/my'), error => error.code === 'REQUEST_TIMEOUT');
  assert.equal(state.authUser.id, 'current-user');
});

test('malformed success responses and interrupted saves have explicit recovery errors', async () => {
  const malformed = portal(async () => response(200, null));
  await assert.rejects(malformed.context.apiFetch('/api/customers/my'), /unreadable response/);
  let requests = 0;
  const interrupted = portal(async () => { requests++; throw new Error('Network lost'); });
  await assert.rejects(interrupted.context.apiFetch('/api/leads', { method: 'POST', body: '{}' }), error => error.code === 'SAVE_UNCONFIRMED');
  assert.equal(requests, 1);
});
