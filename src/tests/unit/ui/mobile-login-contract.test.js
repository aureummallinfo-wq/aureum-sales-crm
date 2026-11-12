const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('mobile login viewport supports safe areas and keyboard resizing', () => {
  const html = read('frontend/index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /interactive-widget=resizes-content/);
  assert.match(html, /aureum-design-system\.css\?v=20261112/);
  assert.match(html, /app-shell\.js\?v=20261112/);
});

test('mobile login keeps email and phone authentication compatible', () => {
  const shell = read('frontend/app-shell.js');
  assert.match(shell, /Work email or phone/);
  assert.match(shell, /id="userIdentifier"[^>]*type="text"/);
  assert.match(shell, /autocomplete="username"/);
  assert.match(shell, /autocapitalize="none"/);
  assert.match(shell, /autocorrect="off"/);
  assert.match(shell, /enterkeyhint="next"/);
  assert.match(shell, /id="userPassword"[^>]*autocomplete="current-password"/);
  assert.match(shell, /id="userPassword"[^>]*enterkeyhint="go"/);
});

test('phone login UI is single-column, touch friendly, and iOS zoom safe', () => {
  const css = read('frontend/aureum-design-system.css');
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.login-page \.login-brand \{ display: none; \}/);
  assert.match(css, /\.login-form-wrap \{[\s\S]*min-height: 100dvh/);
  assert.match(css, /\.login-form \.form-field input \{[\s\S]*min-height: 48px;[\s\S]*font-size: 16px/);
  assert.match(css, /\.login-form \.password-toggle \{[\s\S]*width: 44px;[\s\S]*height: 44px/);
  assert.match(css, /\.login-form \.btn-primary \{[\s\S]*min-height: 50px/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 850px\) and \(max-height: 520px\) and \(orientation: landscape\)/);
});
