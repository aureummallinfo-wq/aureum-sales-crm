const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function passwordUi(apiFetch = async () => ({ user: { id: 'agent', fullName: 'Agent', email: 'agent@example.test' }, credentials: { email: 'agent@example.test', temporaryPassword: 'TestAccess123!', expiresAt: '2099-01-01T00:00:00Z' } })) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/team-chat-reports-agents.js'), 'utf8');
  const helpers = source.slice(source.indexOf('// Keep only the just-issued credential'), source.indexOf('function userText('));
  const drawers = source.split('\n').filter(line => line.startsWith('function renderUserDrawer()') || line.startsWith('function renderDrawer()')).join('\n');
  const listeners = { click: [], submit: [] }; const windowEvents = {}; const copied = [];
  const field = { value: 'TestAccess123!', type: 'password', labels: [{ textContent: 'Temporary password' }], removeAttribute() { this.attributeCleared = true; } };
  class Element {}
  class Form extends Element {
    constructor() { super(); this.id = 'user-reset-password-form'; this.submit = { disabled: false }; this.error = {}; }
    querySelector(selector) { return selector === '[type="submit"]' ? this.submit : this.error; }
  }
  const context = vm.createContext({
    state: { drawer: 'user-reset-password', users: { detail: { user: { id: 'agent', fullName: 'Agent', email: 'agent@example.test' } } } },
    scope: 'manager-session', portalSessionKey: () => context.scope,
    document: { addEventListener(name, fn) { listeners[name].push(fn); }, querySelector: () => field, getElementById: () => field },
    window: { addEventListener(name, fn) { windowEvents[name] = fn; } },
    Element, HTMLFormElement: Form, navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    userText: value => String(value ?? ''), userDate: value => value, icons: { close: '×' },
    renderProtectedDrawer: fn => fn(), render() { context.lastHtml = vm.runInContext('renderDrawer()', context); },
    apiFetch, loadUsers: async () => {}, showToast: () => {}
  });
  vm.runInContext(helpers + drawers, context);
  const submit = () => listeners.submit[0]({ target: new Form(), preventDefault() {} });
  return { context, submit, listeners, windowEvents, copied, field, Element };
}

test('reset and receipt use the user drawer; passwords are masked and removed when closed', async () => {
  const ui = passwordUi();
  assert.match(vm.runInContext('renderDrawer()', ui.context), /Generate temporary password/);
  await ui.submit();
  assert.match(ui.context.lastHtml, /Temporary password ready/);
  assert.match(ui.context.lastHtml, /type="password" readonly/);
  assert.match(ui.context.lastHtml, /Copy temporary password/);
  assert.match(ui.context.lastHtml, /TestAccess123!/);
  const copy = new ui.Element(); copy.closest = selector => selector === '[data-temporary-password-copy]' ? {} : null;
  await ui.listeners.click[0]({ target: copy });
  assert.deepEqual(ui.copied, ['TestAccess123!']);
  const close = new ui.Element(); close.closest = selector => selector.includes('[data-user-close]') ? {} : null;
  await ui.listeners.click[0]({ target: close });
  assert.equal(ui.field.value, ''); assert.equal(ui.field.attributeCleared, true);
  assert.doesNotMatch(vm.runInContext('renderDrawer()', ui.context), /TestAccess123!/);
});

test('late reset responses cannot reveal credentials after the dialog closes and reopens', async () => {
  let resolve;
  const ui = passwordUi(() => new Promise(done => { resolve = done; }));
  const pending = ui.submit();
  ui.windowEvents.popstate();
  resolve({ user: { fullName: 'Agent' }, credentials: { temporaryPassword: 'LateSecret123!' } });
  await pending;
  assert.equal(ui.context.state.drawer, 'user-reset-password');
  assert.doesNotMatch(vm.runInContext('renderDrawer()', ui.context), /LateSecret123!/);
});

test('switching sessions or leaving the page clears a temporary credential', async () => {
  const ui = passwordUi(); await ui.submit();
  ui.context.scope = 'different-session';
  assert.doesNotMatch(vm.runInContext('renderDrawer()', ui.context), /TestAccess123!/);
  assert.equal(ui.field.value, '');
  ui.field.value = 'AnotherTestSecret123!';
  ui.windowEvents.pagehide();
  assert.equal(ui.field.value, '');
});
