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
  const dashboardRuntime = fs.readFileSync(path.join(ROOT, 'frontend/features/dashboard/dashboard-module.js'), 'utf8');

  assert.match(css, /--gold:/);
  assert.match(css, /--ink:/);
  assert.match(css, /--sidebar:/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.drawer/);
  assert.match(css, /\.table-wrap/);
  assert.match(css, /\.app-shell \.table-wrap table th:first-child, \.app-shell \.table-wrap table td:first-child/);
  assert.match(css, /\.dashboard-chart-tooltip/);
  assert.match(css, /\.dashboard-line-hotspot/);
  assert.match(css, /\.chat-workspace \{[^}]*height:\s*clamp\(520px/);
  assert.match(css, /\.chat-workspace \.messages \{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.chat-workspace \.chat-compose \{[^}]*flex:\s*0 0 auto/);
  assert.match(foundation, /:focus-visible/);
  assert.match(shell, /renderAccessDenied/);
  assert.match(html, /skip-link/);
  assert.match(settingsRuntime, /data-mobile-sidebar-toggle|mobileSidebar/i);
  assert.match(dashboardRuntime, /dashboardTooltip/);
  assert.match(dashboardRuntime, /dashboard-tooltip-anchor/);
});
