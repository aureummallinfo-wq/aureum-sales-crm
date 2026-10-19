const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const role of ['sales_manager', 'sales_agent']) {
  test(`${role} refresh shares one startup and preserves the restored account`, async () => {
    let finish, requests = 0, renders = 0, followups = 0;
    const pending = new Promise(resolve => { finish = resolve; });
    const context = vm.createContext({ window: { location: { pathname: '/my-account' }, setTimeout, clearTimeout, setInterval: () => 1, history: { replaceState() {} } }, document: { querySelector() {}, addEventListener() {} }, fetch: async () => { requests++; return pending; }, AbortController, URLSearchParams, render: () => { renders++; }, loadFollowups: () => { followups++; } });
    const shell = source('frontend/app-shell.js');
    vm.runInContext(shell.slice(0, shell.indexOf('/* Personal display preferences')) + '\nglobalThis.portalState = state;', context);
    const runtime = source('frontend/app-runtime.js');
    vm.runInContext(runtime.slice(runtime.indexOf('let portalBootPromise;'), runtime.indexOf('window.aureumFinalBind')), context);
    const first = context.boot(); const second = context.boot();
    assert.equal(first, second);
    finish({ ok: true, status: 200, json: async () => ({ user: { id: 'mock-user', role, team_id: 'team_a' } }) });
    await Promise.all([first, second]);
    assert.equal(requests, 1); assert.equal(renders, 1); assert.equal(followups, 1);
    assert.equal(context.portalState.authUser.id, 'mock-user'); assert.equal(context.portalState.screen, 'my-account');
    assert.equal(context.portalState.role, role.toUpperCase());
    await context.boot(); assert.equal(requests, 1);
  });
}

function forms() {
  const state = { role: 'SALES_MANAGER', customerModule: { statusesLoaded: true, editing: true }, leadModule: { agentsLoaded: true, agents: [{ id: 'agent-1', full_name: 'Active advisor', role: 'sales_agent', status: 'Active' }, { id: 'agent-2', full_name: 'Inactive advisor', status: 'Inactive' }] } };
  const window = {};
  const listeners = {};
  const context = vm.createContext({ state, window, document: { addEventListener(type, listener) { (listeners[type] ||= []).push(listener); }, querySelector() {} }, isManager: () => true, render() {}, apiFetch: async () => { throw new Error('Cached form must not refetch'); }, formField: (label, name, markup) => `<label>${label}</label>${markup}`, pageHeader: (_, title) => `<h1>${title}</h1>`, badge: text => text, icons: {} });
  vm.runInContext(source('frontend/features/follow-ups/utils/followup-note-ui.js'), context);
  vm.runInContext(source('frontend/features/leads/leads-module.js'), context);
  vm.runInContext(source('frontend/features/customers/customers-module.js'), context);
  return { context, state, window, listeners };
}

test('manager lead form retains active advisor options on cached navigation and redraw', async () => {
  const { window, state } = forms();
  await window.loadLeadAgents();
  for (let redraw = 0; redraw < 2; redraw++) {
    const html = window.renderAddLead();
    assert.match(html, /<option value="agent-1"[^>]*>Active advisor<\/option>/);
    assert.doesNotMatch(html, /<option[^>]*>Inactive advisor<\/option>/);
    assert.equal(state.leadModule.agents.length, 2);
  }
});

for (const interest of ['Commercial', 'Rooftop restaurant', 'Office <special>']) {
  test(`customer edit retains the existing ${interest} interest`, () => {
    const { window, state } = forms();
    state.customerDetail = { data: { id: 'customer-1', full_name: 'Mock customer', interested_in: interest, property_type: 'Commercial' } };
    const html = window.renderCustomerDrawer();
    const select = html.match(/<select name="interested_in">([\s\S]*?)<\/select>/)[1];
    const escaped = interest.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert.ok(select.includes(`<option value="${escaped}" selected>${escaped}</option>`));
  });
}

test('editing an already-open customer does not refetch and replace the new form', () => {
  const { state, context, listeners } = forms();
  state.customerModule.editing = false;
  state.customerDetail = { data: { id: 'customer-1', full_name: 'Mock customer' } };
  let reloads = 0;
  context.openCustomer = () => { reloads++; };
  for (const listener of listeners.click) listener({ preventDefault() {}, target: { closest: selector => selector === '[data-customer-module-action]' ? { dataset: { customerModuleAction: 'edit', customerId: 'customer-1' } } : null } });
  assert.equal(state.customerModule.editing, true); assert.equal(reloads, 0);
});

test('a missing customer interest stays empty rather than saving the display dash', () => {
  const { window, state } = forms();
  state.customerDetail = { data: { id: 'customer-1', full_name: 'Mock customer' } };
  const select = window.renderCustomerDrawer().match(/<select name="interested_in">([\s\S]*?)<\/select>/)[1];
  assert.match(select, /<option value="">Choose an interest<\/option>/);
  assert.doesNotMatch(select, /value="—"/);
});
