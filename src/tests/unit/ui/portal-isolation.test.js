const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const shell = fs.readFileSync(path.join(__dirname, '../../../../frontend/app-shell.js'), 'utf8');
function browser(fetch) {
  const window = { setTimeout, clearTimeout };
  const context = vm.createContext({ window, document: { querySelector: () => null }, fetch, AbortController, URL, console });
  vm.runInContext(shell.slice(0, shell.indexOf('/* Personal display preferences')), context);
  for (const name of ['loadFollowups', 'loadCustomers']) {
    const start = shell.indexOf(`async function ${name}(`);
    const end = shell.indexOf('\nfunction ', start);
    vm.runInContext(shell.slice(start, end), context);
  }
  vm.runInContext('render = () => {}; window.test = { state, apiFetch, portalSessionKey, loadFollowups, loadCustomers };', context);
  return window.test;
}
const user = (id, workspace_id = 'lahore') => ({ id, workspace_id, role: 'sales_agent', team_id: 'team-a' });
const response = (name, status = 200) => ({ ok: status === 200, status, json: async () => ({ data: [{ id: name }], error: 'Expired session' }) });

test('profile changes clear customer records, follow-ups, details and cached responses', async () => {
  let requests = 0;
  const app = browser(async () => response(`result-${++requests}`));
  app.state.authUser = user('adan');
  const priorScope = app.portalSessionKey();
  const old = await app.apiFetch('/api/follow-ups/my', { cacheTtl: 15000 });
  await app.apiFetch('/api/follow-ups/my', { cacheTtl: 15000 });
  assert.equal(requests, 1);
  app.state.followups.items = old.data;
  app.state.customers.items = [{ id: 'private-customer' }];
  app.state.followupDetail = { data: { id: 'private-reminder' } };
  app.state.notificationsData = [{ message: 'Private customer' }];
  app.state.authUser = user('saqib');
  assert.notEqual(app.portalSessionKey(), priorScope);
  assert.equal(app.state.followups.items.length, 0);
  assert.equal(app.state.customers.items.length, 0);
  assert.equal(app.state.followupDetail, null);
  assert.equal(app.state.notificationsData.length, 0);
  const current = await app.apiFetch('/api/follow-ups/my', { cacheTtl: 15000 });
  assert.equal(requests, 2);
  assert.equal(current.data[0].id, 'result-2');
});

test('late follow-up and customer responses cannot overwrite the new profile', async () => {
  const pending = [];
  const app = browser(() => new Promise(resolve => pending.push(resolve)));
  app.state.authUser = user('adan');
  const oldFollowups = app.loadFollowups();
  const oldCustomers = app.loadCustomers();
  app.state.authUser = user('saqib');
  const newFollowups = app.loadFollowups();
  const newCustomers = app.loadCustomers();
  pending[2](response('saqib-reminder'));
  pending[3](response('saqib-customer'));
  await Promise.all([newFollowups, newCustomers]);
  pending[0](response('adan-reminder'));
  pending[1](response('adan-customer'));
  await Promise.all([oldFollowups, oldCustomers]);
  assert.equal(app.state.followups.items[0].id, 'saqib-reminder');
  assert.equal(app.state.customers.items[0].id, 'saqib-customer');
  assert.equal(app.state.followups.error, '');
  assert.equal(app.state.customers.error, '');
});

test('an old unauthorized response cannot sign out the next profile', async () => {
  let finish;
  const app = browser(() => new Promise(resolve => { finish = resolve; }));
  app.state.authUser = user('adan');
  const oldRequest = app.apiFetch('/api/follow-ups/my');
  const rejected = assert.rejects(oldRequest, /account changed/);
  app.state.authUser = user('saqib');
  finish(response('old', 401));
  await rejected;
  assert.equal(app.state.authUser.id, 'saqib');
});

test('workspace, team and logout changes invalidate the same account scope', () => {
  const app = browser(async () => response('unused'));
  app.state.authUser = user('agent');
  const lahore = app.portalSessionKey();
  app.state.followups.items = [{ id: 'lahore-only' }];
  app.state.authUser = user('agent', 'other-city');
  assert.notEqual(app.portalSessionKey(), lahore);
  assert.equal(app.state.followups.items.length, 0);
  app.state.customers.items = [{ id: 'other-city-only' }];
  app.state.authUser = { ...app.state.authUser, team_id: 'team-b' };
  assert.equal(app.state.customers.items.length, 0);
  app.state.followups.items = [{ id: 'team-b-only' }];
  app.state.authUser = null;
  assert.equal(app.state.followups.items.length, 0);
});
