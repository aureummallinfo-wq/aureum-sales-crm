const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/api-test-server');

test('visual UI regression guard preserves responsive Aureum layout foundations', () => {
  const css = fs.readFileSync(path.join(ROOT, 'frontend/aureum-design-system.css'), 'utf8');
  const foundation = fs.readFileSync(path.join(ROOT, 'frontend/ui-foundation.css'), 'utf8');
  const shell = fs.readFileSync(path.join(ROOT, 'frontend/app-shell.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
  const settingsRuntime = fs.readFileSync(path.join(ROOT, 'frontend/settings-system-enhancements.js'), 'utf8');

  assert.match(css, /--gold:/);
  assert.match(css, /--ink:/);
  assert.match(css, /--sidebar:/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.drawer/);
  assert.match(css, /\.table-wrap/);
  assert.match(foundation, /:focus-visible/);
  assert.match(shell, /renderAccessDenied/);
  assert.match(html, /skip-link/);
  assert.match(settingsRuntime, /data-mobile-sidebar-toggle|mobileSidebar/i);
});
