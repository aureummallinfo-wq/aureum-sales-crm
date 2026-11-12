const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('mobile sidebar close controls are directly rebound after every render', () => {
  const settings = read('frontend/settings-system-enhancements.js');
  const runtime = read('frontend/module9-settings-account-runtime.js');

  assert.match(settings, /function closeMobileSidebar9\(event\)[\s\S]*state\.mobileSidebarOpen = false;[\s\S]*render\(\)/);
  assert.match(settings, /function bindMobileSidebarControls9\(\)[\s\S]*querySelectorAll\('\[data-mobile-sidebar-close\]'\)[\s\S]*addEventListener\('click', closeMobileSidebar9\)/);
  assert.doesNotMatch(settings, /closest\('\[data-mobile-sidebar-toggle\], \[data-mobile-sidebar-close\]'\)/);
  assert.match(runtime, /bindMobileSidebarControls9\(\)/);
});

test('mobile sidebar close button has a reliable touch target', () => {
  const css = read('frontend/aureum-design-system.css');
  assert.match(css, /\.app-shell \.mobile-sidebar-close \{[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*pointer-events: auto;[\s\S]*touch-action: manipulation;/);
});

test('mobile sidebar close assets are cache busted', () => {
  const html = read('frontend/index.html');
  assert.match(html, /aureum-design-system\.css\?v=20261112-sidebar-close/);
  assert.match(html, /settings-system-enhancements\.js\?v=20261112-sidebar-close/);
  assert.match(html, /module9-settings-account-runtime\.js\?v=20261112-sidebar-close/);
});
