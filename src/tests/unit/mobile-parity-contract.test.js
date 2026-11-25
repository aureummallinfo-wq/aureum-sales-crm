const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const mobile = (...parts) => path.join(ROOT, 'mobile', ...parts);
const read = file => fs.readFileSync(mobile(...file), 'utf8');

test('mobile project keeps the canonical CRM roles and server-backed data contract', () => {
  const server = fs.readFileSync(path.join(ROOT, 'backend', 'crm-api-server.js'), 'utf8');
  const mobileUi = read(['src', 'components', 'ui.tsx']);
  const mobileTypes = read(['src', 'types', 'api.ts']);
  for (const role of ['super_admin', 'sales_manager', 'sales_agent', 'hr', 'project_manager']) {
    assert.match(server, new RegExp(`\\b${role}\\b`));
    assert.match(mobileUi, new RegExp(`['"]${role}['"]`));
    assert.match(mobileTypes, new RegExp(`\\b${role}\\b`));
  }
  const dashboard = read(['app', '(tabs)', 'index.tsx']);
  assert.equal((dashboard.match(/\/api\/dashboard\/initial/g) || []).length, 1);
  assert.doesNotMatch(dashboard, /\/api\/dashboard\/(summary|lead-inflow|lead-sources|follow-up-performance|conversion-overview)/);
  assert.match(dashboard, /label="Overdue follow-ups"/);
  assert.match(dashboard, /Show all agents/);
});

test('mobile project exposes the expected CRM screens and Android release configuration', () => {
  const expectedRoutes = [
    ['app', 'login.tsx'],
    ['app', 'notifications.tsx'],
    ['app', 'search.tsx'],
    ['app', 'lead', 'new.tsx'],
    ['app', 'lead', '[id].tsx'],
    ['app', 'customer', '[id].tsx'],
    ['app', 'follow-up', '[id].tsx'],
    ['app', 'task', '[id].tsx'],
    ['app', 'user', '[id].tsx'],
    ['app', '(tabs)', 'index.tsx'],
    ['app', '(tabs)', 'leads.tsx'],
    ['app', '(tabs)', 'my-leads.tsx'],
    ['app', '(tabs)', 'customers.tsx'],
    ['app', '(tabs)', 'follow-ups.tsx'],
    ['app', '(tabs)', 'tasks.tsx'],
    ['app', '(tabs)', 'reports.tsx'],
    ['app', '(tabs)', 'team-chat.tsx'],
    ['app', '(tabs)', 'users.tsx'],
    ['app', '(tabs)', 'settings.tsx'],
    ['app', '(tabs)', 'account.tsx']
  ];
  for (const route of expectedRoutes) assert.equal(fs.existsSync(mobile(...route)), true, route.join('/'));
  const entry = read(['app', 'index.tsx']);
  assert.match(entry, /useSession/);
  assert.match(entry, /Redirect href=\{user \? '\/\(tabs\)' : '\/login'\}/);
  assert.doesNotMatch(entry, /web-crm/);
  const config = JSON.parse(fs.readFileSync(mobile('app.json'), 'utf8')).expo;
  assert.equal(config.version, '0.1.3');
  assert.equal(config.android.package, 'info.aureummall.crm');
  assert.equal(config.android.versionCode, 4);
  assert.equal(config.icon, './assets/aureum-logo.png');
  assert.equal(config.splash.image, './assets/aureum-logo.png');
  assert.ok(config.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications'));
});

test('mobile operational screens do not ship known demo CRM records', () => {
  const files = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') collect(fullPath);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(fullPath);
    }
  }
  collect(mobile('app'));
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /Ahmed Khan|Sara Malik|Ali Raza/);
});

test('mobile owns the complete shell and receives CRM records through the API client', () => {
  const packageJson = JSON.parse(fs.readFileSync(mobile('package.json'), 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.dependencies || {}, 'react-native-webview'), false);

  const files = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') collect(fullPath);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(fullPath);
    }
  }
  collect(mobile('app'));
  collect(mobile('src'));
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /WebView|react-native-webview|web-crm/);

  const ui = read(['src', 'components', 'ui.tsx']);
  assert.match(ui, /function NavigationDrawer/);
  assert.match(ui, /function LoadingCard/);
  assert.match(ui, /function ContactActions/);
  assert.match(ui, /onRetry\?: \(\) => void/);
  assert.match(ui, /export function Card/);

  const client = read(['src', 'api', 'client.ts']);
  assert.match(client, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(client, /Accept:\s*'application\/json'/);
  assert.match(client, /only accepts API routes/);
  assert.match(client, /createRequestSignal/);
  assert.match(client, /setTimeout\(\(\) => controller\.abort\(\), 20_000\)/);
  assert.match(client, /addEventListener\('abort', abortFromExternal/);
  assert.match(client, /refreshOnce/);
  assert.match(client, /refreshPromise/);
  assert.match(client, /await response\.json\(\)/);
  assert.match(client, /await response\.text\(\)/);
  assert.match(client, /networkError\(error\)/);
  const session = read(['src', 'auth', 'session.tsx']);
  assert.match(session, /queryClient\.clear\(\)/);
});

test('native operational registries expose server-side CRM date ranges', () => {
  const screens = [
    ['app', '(tabs)', 'leads.tsx'],
    ['app', '(tabs)', 'customers.tsx'],
    ['app', '(tabs)', 'follow-ups.tsx'],
    ['app', '(tabs)', 'tasks.tsx'],
    ['app', '(tabs)', 'users.tsx']
  ];
  for (const screen of screens) {
    const source = read(screen);
    assert.match(source, /DateRangeControls/);
    assert.match(source, /dateRangeBounds/);
    assert.match(source, /dateRangeReady/);
  }
  assert.match(read(['app', '(tabs)', 'leads.tsx']), /dateFrom/);
  assert.match(read(['app', '(tabs)', 'customers.tsx']), /dateFrom/);
  assert.match(read(['app', '(tabs)', 'tasks.tsx']), /dateFrom/);
  assert.match(read(['app', '(tabs)', 'users.tsx']), /dateFrom/);
  assert.match(read(['app', '(tabs)', 'follow-ups.tsx']), /customStart/);
});

test('native lead lifecycle exposes tag conversion and management safeguards', () => {
  const leads = read(['app', '(tabs)', 'leads.tsx']);
  const detail = read(['app', 'lead', '[id].tsx']);
  const dashboard = read(['app', '(tabs)', 'index.tsx']);
  assert.match(leads, /Unassigned leads/);
  assert.match(leads, /assign an advisor before converting/);
  assert.match(detail, /\/api\/leads\/\$\{encodeURIComponent\(String\(id\)\)\}\/tags/);
  assert.match(detail, /Save tags/);
  assert.match(detail, /Assign a sales agent before a Customer can be created/);
  assert.match(dashboard, /totalCustomers/);
});

test('native follow-up workflows cover creation, contact actions, notes, and lifecycle updates', () => {
  const list = read(['app', '(tabs)', 'follow-ups.tsx']);
  const detail = read(['app', 'follow-up', '[id].tsx']);
  assert.match(list, /\/api\/follow-ups/);
  assert.match(list, /Schedule follow-up/);
  assert.match(list, /customers\/my/);
  assert.match(detail, /ContactActions/);
  assert.match(detail, /\/notes/);
  assert.match(detail, /reschedule/);
  assert.match(detail, /Mark complete/);
  assert.match(detail, /Mark missed/);
  assert.match(detail, /Cancel follow-up/);
});

test('native session registers device push notifications against the CRM API', () => {
  const session = read(['src', 'auth', 'session.tsx']);
  const push = read(['src', 'notifications', 'push.ts']);
  assert.match(session, /\/api\/mobile\/push-tokens/);
  assert.match(session, /addNotificationReceivedListener/);
  assert.match(session, /addNotificationResponseReceivedListener/);
  assert.match(push, /getExpoPushTokenAsync/);
  assert.match(push, /setNotificationChannelAsync/);
});

test('native settings can inspect the web CRM pipeline configuration and Android releases lazily', () => {
  const settings = read(['app', '(tabs)', 'settings.tsx']);
  for (const endpoint of ['lead-statuses', 'customer-statuses', 'lead-tags', 'lead-sources']) {
    assert.match(settings, new RegExp(`/api/settings/${endpoint}`));
  }
  assert.match(settings, /\/api\/app\/releases/);
  assert.match(settings, /showPipelineConfig/);
});

test('native user management exposes server-backed role and team controls', () => {
  const detail = read(['app', 'user', '[id].tsx']);
  assert.match(detail, /\/api\/users\/teams/);
  assert.match(detail, /teamId/);
  assert.match(detail, /setRole/);
  assert.match(detail, /sales_manager/);
});
