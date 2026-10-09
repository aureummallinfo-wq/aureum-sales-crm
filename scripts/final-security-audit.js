const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const port = 4187;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['backend/crm-api-server.js'], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });

async function waitForServer() { for (let attempt = 0; attempt < 40; attempt += 1) { try { await fetch(`${base}/`); return; } catch { await new Promise(resolve => setTimeout(resolve, 75)); } } throw new Error('Audit server did not start.'); }
async function request(path, options = {}) { const response = await fetch(`${base}${path}`, options); const body = await response.json().catch(() => ({})); return { response, body }; }
async function login(identifier, password = 'Aureum123!') { const result = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) }); assert.equal(result.response.status, 200); return result.response.headers.get('set-cookie'); }
async function run() {
  await waitForServer();
  const unauthenticated = await request('/api/settings'); assert.equal(unauthenticated.response.status, 401);
  const adminCookie = await login('admin@aureum.com'); const adminSettings = await request('/api/settings', { headers: { cookie: adminCookie } }); assert.equal(adminSettings.response.status, 200); assert.ok(adminSettings.body.data.security);
  const managerCookie = await login('manager@aureum.com'); const managerSettings = await request('/api/settings', { headers: { cookie: managerCookie } }); assert.equal(managerSettings.response.status, 403);
  const managerLeads = await request('/api/leads', { headers: { cookie: managerCookie } }); assert.equal(managerLeads.response.status, 200); assert.ok((managerLeads.body.data || []).every(lead => lead.assigned_team_id === 'team_a' || lead.assigned_team_id === null));
  const agentCookie = await login('advisor@aureum.com');
  for (const path of ['/api/leads', '/api/reports/summary', '/api/users', '/api/settings']) { const result = await request(path, { headers: { cookie: agentCookie } }); assert.equal(result.response.status, 403, `Sales Agent must be denied ${path}`); }
  const ownLead = await request('/api/leads/lead_003', { headers: { cookie: agentCookie } }); assert.equal(ownLead.response.status, 403);
  const staticBackend = await fetch(`${base}/backend/crm-api-server.js`); assert.equal(staticBackend.status, 404);
  const headers = await fetch(`${base}/`); assert.equal(headers.headers.get('x-content-type-options'), 'nosniff'); assert.equal(headers.headers.get('x-frame-options'), 'DENY');
  console.log('Final security audit passed: authentication, role boundaries, lead scoping, IDOR regression, static-file isolation, and security headers.');
}

run().catch(error => { console.error(`Final security audit failed: ${error.message}`); process.exitCode = 1; }).finally(() => server.kill());
