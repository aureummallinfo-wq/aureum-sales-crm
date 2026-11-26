const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../../..');
const sharedSource = fs.readFileSync(path.join(ROOT, 'frontend/shared/search-focus.js'), 'utf8');
const guardSource = fs.readFileSync(path.join(ROOT, 'frontend/lead-search-focus.js'), 'utf8');

function focusRuntime(selector, value = 'Ahmed') {
  class Element {}
  let currentInput;
  const body = new Element();
  const document = {
    activeElement: null,
    querySelector(query) {
      return String(query).split(',').some(item => currentInput?.matches(item.trim())) ? currentInput : null;
    }
  };

  class Input extends Element {
    constructor() {
      super();
      this.value = value;
      this.selectionStart = 2;
      this.selectionEnd = 4;
      this.selectionDirection = 'backward';
    }
    matches(query) { return query === selector; }
    focus() { document.activeElement = this; this.focused = true; }
    setSelectionRange(start, end, direction) { this.selection = [start, end, direction]; }
  }

  currentInput = new Input();
  document.activeElement = currentInput;
  const window = {
    render() {
      currentInput = new Input();
      document.activeElement = body;
    }
  };
  const context = vm.createContext({ window, document, Element });
  vm.runInContext(sharedSource, context);
  vm.runInContext(guardSource, context);
  return { window, document, input: () => currentInput, body };
}

test('all CRM registry searches keep focus and cursor position after a full render', () => {
  for (const selector of [
    '[data-leads-search]',
    '[data-customer-module-search]',
    '[data-followup-module-search]',
    '[data-task-search]',
    '[data-meta-intake-search]',
    '[data-global-search]',
    '[data-agent-search]',
    '[data-users-search]'
  ]) {
    const app = focusRuntime(selector);
    app.window.render();
    assert.equal(app.document.activeElement, app.input(), selector);
    assert.equal(app.input().focused, true, selector);
    assert.deepEqual(app.input().selection, [2, 4, 'backward'], selector);
  }
});

test('an unrelated control is not replaced by search focus restoration', () => {
  const app = focusRuntime('[data-customer-module-search]');
  app.document.activeElement = app.body;
  app.window.render();
  assert.equal(app.document.activeElement, app.body);
  assert.equal(app.input().focused, undefined);
});

test('delayed registry loaders explicitly preserve active search fields', () => {
  const appShell = fs.readFileSync(path.join(ROOT, 'frontend/app-shell.js'), 'utf8');
  const metaRuntime = fs.readFileSync(path.join(ROOT, 'frontend/meta-intake-runtime.js'), 'utf8');
  assert.match(appShell, /renderWithSearchFocus\('\[data-customer-module-search\], \[data-customer-search\]'\)/);
  assert.match(appShell, /renderWithSearchFocus\('\[data-followup-module-search\], \[data-followup-search\]'\)/);
  assert.match(metaRuntime, /renderWithSearchFocus\('\[data-meta-intake-search\]'\)/);
});
