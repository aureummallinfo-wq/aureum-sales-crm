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
  const webhookDenied = await request('/api/settings/webhooks', { headers: { cookie: managerCookie } }); assert.equal(webhookDenied.response.status, 403, 'Sales Managers must not manage webhook connections');
  const connectionResult = await request('/api/settings/webhooks', { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ connectionName: 'Audit Meta Intake', sourceType: 'meta_lead_ads', sourcePlatform: 'meta', defaultLeadSource: 'Meta Lead Ads', defaultLeadStatus: 'New', defaultTags: ['Meta Lead', 'Imported Lead'] }) }); assert.equal(connectionResult.response.status, 201); assert.ok(connectionResult.body.secretToken); assert.ok(!JSON.stringify(connectionResult.body.data).includes('secret_hash'));
  const connectionId = connectionResult.body.data.id; const oneTimeSecret = connectionResult.body.secretToken;
  const enabled = await request(`/api/settings/webhooks/${connectionId}/enable`, { method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: '{}' }); assert.equal(enabled.response.status, 200);
  const missingSecret = await request(`/api/webhooks/leads/${connectionId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ full_name: 'Rejected inbound' }) }); assert.equal(missingSecret.response.status, 401);
  const inboundPayload = { source: 'meta_lead_ads', platform: 'meta', external_lead_id: 'audit-external-001', full_name: 'Imported Audit Lead', phone: '0300-1234567', email: 'imported.audit@example.com', interested_in: 'Apartment' };
  const inbound = await request(`/api/webhooks/leads/${connectionId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aureum-webhook-secret': oneTimeSecret }, body: JSON.stringify(inboundPayload) }); assert.equal(inbound.response.status, 200); assert.equal(inbound.body.duplicate, false);
  const duplicate = await request(`/api/webhooks/leads/${connectionId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aureum-webhook-secret': oneTimeSecret }, body: JSON.stringify(inboundPayload) }); assert.equal(duplicate.response.status, 200); assert.equal(duplicate.body.duplicate, true);
  const managerImported = await request(`/api/leads?imported=unassigned`, { headers: { cookie: managerCookie } }); assert.equal(managerImported.response.status, 200); assert.ok(managerImported.body.data.some(lead => lead.id === inbound.body.leadId));
  const agentMyLeads = await request('/api/leads/my', { headers: { cookie: agentCookie } }); assert.equal(agentMyLeads.response.status, 200); assert.ok(!agentMyLeads.body.data.some(lead => lead.id === inbound.body.leadId));
  const rotated = await request(`/api/settings/webhooks/${connectionId}/regenerate-secret`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: '{}' }); assert.equal(rotated.response.status, 200); assert.notEqual(rotated.body.secretToken, oneTimeSecret);
  const oldSecret = await request(`/api/webhooks/leads/${connectionId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aureum-webhook-secret': oneTimeSecret }, body: JSON.stringify({ full_name: 'Old secret rejected', phone: '0300-7654321' }) }); assert.equal(oldSecret.response.status, 401);
  const staticBackend = await fetch(`${base}/backend/crm-api-server.js`); assert.equal(staticBackend.status, 404);
  const headers = await fetch(`${base}/`); assert.equal(headers.headers.get('x-content-type-options'), 'nosniff'); assert.equal(headers.headers.get('x-frame-options'), 'DENY');
  console.log('Final security audit passed: authentication, role boundaries, lead scoping, IDOR regression, static-file isolation, and security headers.');
}

run().catch(error => { console.error(`Final security audit failed: ${error.message}`); process.exitCode = 1; }).finally(() => server.kill());
