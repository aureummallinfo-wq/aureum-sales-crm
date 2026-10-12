const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const PASSWORD = 'Aureum123!';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startNeonApiServer(t) {
  const port = 4700 + Math.floor(Math.random() * 200);
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  const server = spawn(process.execPath, ['--env-file=.env.local', 'backend/crm-api-server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });

  t.after(() => {
    if (!server.killed) server.kill();
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) break;
    } catch {
      await wait(100);
    }
    if (attempt === 79) throw new Error(`Neon API server did not start. Output: ${output}`);
  }

  assert.match(output, /connected to Neon PostgreSQL/i, `API did not confirm Neon connection. Output: ${output}`);

  async function request(route, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(15000) });
    } catch (error) {
      throw new Error(`${options.method || 'GET'} ${route} failed: ${error.message}`);
    }
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    return { response, body, text };
  }

  async function login(identifier, password = PASSWORD) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    assert.equal(result.response.status, 200, `Login failed for ${identifier}: ${result.text}`);
    return result.response.headers.get('set-cookie');
  }

  return { request, login };
}

function assertDataArray(result, route, fields = []) {
  assert.equal(result.response.status, 200, `${route} should return HTTP 200`);
  assert.ok(Array.isArray(result.body.data), `${route} must return data as an array`);
  for (const item of result.body.data) {
    for (const field of fields) assert.ok(Object.hasOwn(item, field), `${route} item is missing ${field}`);
  }
}

test('CRM readiness: Neon-backed authentication, roles, dashboard contracts, and core reads', { skip: process.env.CRM_READINESS !== '1' }, async t => {
  const api = await startNeonApiServer(t);
  const users = [
    { identifier: 'waqas@aureum.com', password: 'Waqas@123', role: 'super_admin', scope: 'company' },
    { identifier: 'dua@aureum.com', password: 'Rana@123', role: 'sales_manager', scope: 'team' },
    { identifier: 'adan@aureum.com', password: 'Rehman@123', role: 'sales_agent', scope: 'assigned' }
  ];
  const sessions = {};

  const unauthenticated = await api.request('/api/dashboard/summary');
  assert.equal(unauthenticated.response.status, 401, 'protected dashboard data must require a session');

  for (const account of users) {
    sessions[account.role] = await api.login(account.identifier, account.password);
    const me = await api.request('/api/auth/me', { headers: { cookie: sessions[account.role] } });
    assert.equal(me.response.status, 200, `${account.role} session should load`);
    assert.equal(me.body.user.role, account.role, `${account.identifier} must keep its expected role`);

    const summary = await api.request('/api/dashboard/summary', { headers: { cookie: sessions[account.role] } });
    assert.equal(summary.response.status, 200);
    assert.equal(summary.body.scope, account.scope);
    assert.ok(Object.hasOwn(summary.body.data, 'totalLeads'), 'dashboard summary must include totalLeads');
    assert.ok(Object.hasOwn(summary.body.data, 'totalAgents'), 'dashboard summary must include totalAgents');

    const dashboardRoutes = [
      ['/api/dashboard/lead-inflow', ['label', 'leads']],
      ['/api/dashboard/lead-sources', ['name', 'source', 'count', 'percentage']],
      ['/api/dashboard/follow-up-performance', ['name', 'status', 'count']],
      ['/api/dashboard/conversion-overview', ['stage', 'count', 'percentage']],
      ['/api/dashboard/recent-leads'],
      ['/api/dashboard/today-follow-ups']
    ];
    for (const [route, fields = []] of dashboardRoutes) {
      const result = await api.request(route, { headers: { cookie: sessions[account.role] } });
      assertDataArray(result, route, fields);
    }

    for (const route of ['/api/leads/my', '/api/customers/my', '/api/follow-ups/my']) {
      const result = await api.request(route, { headers: { cookie: sessions[account.role] } });
      assertDataArray(result, route);
    }
  }

  for (const role of ['super_admin', 'sales_manager']) {
    const result = await api.request('/api/dashboard/agent-performance', { headers: { cookie: sessions[role] } });
    assertDataArray(result, '/api/dashboard/agent-performance', ['agentId', 'assignedLeads', 'conversionRate']);
  }

  for (const route of ['/api/dashboard/agent-performance', '/api/leads', '/api/reports/summary', '/api/settings']) {
    const result = await api.request(route, { headers: { cookie: sessions.sales_agent } });
    assert.equal(result.response.status, 403, `Sales Agent must not access ${route}`);
  }

  const managerSettings = await api.request('/api/settings', { headers: { cookie: sessions.sales_manager } });
  assert.equal(managerSettings.response.status, 403, 'Sales Manager must not access admin settings');

  const adminSettings = await api.request('/api/settings', { headers: { cookie: sessions.super_admin } });
  assert.equal(adminSettings.response.status, 200, 'Super Admin should access settings');

  const dashboardSource = require('node:fs').readFileSync(path.join(ROOT, 'frontend/features/dashboard/dashboard-module.js'), 'utf8');
  assert.doesNotMatch(dashboardSource, /dashboardMock/, 'dashboard frontend must not contain the removed mock dataset');
  const frontendIndex = require('node:fs').readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
  assert.doesNotMatch(frontendIndex, /\/data\/mock-/, 'frontend must not load mock data scripts');
});
