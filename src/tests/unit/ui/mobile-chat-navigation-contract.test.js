const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('mobile CRM navigation closes before route navigation and owns the top layer', () => {
  const settings = read('frontend/settings-system-enhancements.js');
  const css = read('frontend/aureum-design-system.css');

  assert.match(settings, /closest\('\.sidebar \[data-screen\]'\)/);
  assert.match(settings, /navigationTarget[\s\S]*state\.mobileSidebarOpen = false;[\s\S]*return;/);
  assert.match(settings, /const opening =[\s\S]*state\.chatSidebarOpen = false;[\s\S]*state\.chatRightInfoOpen = false;/);
  assert.match(css, /\.app-shell > \.sidebar \{ z-index: 80; \}/);
  assert.match(css, /\.app-shell > \.mobile-sidebar-backdrop \{ z-index: 70; \}/);
  assert.match(css, /\.app-shell \.chat-workspace \.chat-sidebar \{ z-index: 50; \}/);
});

test('Team Chat closes the global CRM drawer when a conversation takes focus', () => {
  const chat = read('frontend/team-chat-reports-agents.js');

  assert.match(chat, /function closeGlobalMobileNavigationForChat\(\) \{[\s\S]*state\.mobileSidebarOpen = false;/);
  assert.match(chat, /openChatChannel[\s\S]*closeGlobalMobileNavigationForChat\(\)/);
  assert.match(chat, /openChatGroup[\s\S]*closeGlobalMobileNavigationForChat\(\)/);
  assert.match(chat, /openDirectChat[\s\S]*closeGlobalMobileNavigationForChat\(\)/);
  assert.match(chat, /function navigate\(screen\) \{ state\.mobileSidebarOpen = false;/);
});

test('mobile navigation fix assets are cache busted', () => {
  const html = read('frontend/index.html');
  assert.match(html, /aureum-design-system\.css\?v=20261112-chat-nav/);
  assert.match(html, /team-chat-reports-agents\.js\?v=20261112-chat-nav/);
  assert.match(html, /settings-system-enhancements\.js\?v=20261112-chat-nav/);
});
