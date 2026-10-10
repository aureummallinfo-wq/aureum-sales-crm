const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('browser smoke: SPA routes, static assets, and security headers are served safely', async t => {
  const api = await startApiServer(t);
  const routes = ['/login', '/dashboard', '/all-leads', '/my-leads', '/add-lead', '/customers', '/follow-ups', '/team-chat', '/reports', '/users', '/settings', '/my-account', '/change-password', '/access-denied'];

  for (const route of routes) {
    const result = await api.request(route);
    assert.equal(result.response.status, 200, `${route} should return the SPA shell`);
    assert.match(result.text, /Aureum Sales CRM/);
    assert.equal(result.response.headers.get('x-frame-options'), 'DENY');
    assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  }

  for (const asset of ['/frontend/app-shell.js', '/frontend/app-runtime.js', '/frontend/aureum-design-system.css', '/frontend/module11-webhooks.css']) {
    const result = await api.request(asset);
    assert.equal(result.response.status, 200, `${asset} should load`);
    assert.ok(result.text.length > 100);
  }

  const backendSource = await api.request('/backend/crm-api-server.js');
  assert.equal(backendSource.response.status, 404);
});
