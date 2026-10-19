const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { startApiServer } = require('../helpers/api-test-server');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { createRelationalApi } = require('../../../backend/db/relational-api');

function assertPrivate(payload, secret) {
  const text = JSON.stringify(payload);
  assert.ok(!text.includes(secret), 'Ordinary responses must not contain the issued password');
  assert.ok(!text.includes('password_hash'), 'Password hashes must not leave the API');
  assert.ok(!text.includes('temporaryPassword"'), 'User records must not contain a recoverable password');
}

test('managers and admins can issue an agent temporary password once, with enforced private replacement', async t => {
  const api = await startApiServer(t);
  const admin = await api.login('waqas@aureum.com');
  const manager = await api.login('dua@aureum.com');
  const agent = await api.login('adan@aureum.com');
  const post = (url, cookie, body = {}) => api.request(url, { method: 'POST', headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const url = '/api/users/usr_003/reset-password';
  assert.equal((await post(url)).response.status, 401);
  assert.equal((await post(url, agent)).response.status, 403);
  assert.equal((await post('/api/users/usr_001/reset-password', manager)).response.status, 403);
  assert.equal((await post('/api/users/usr_002/reset-password', manager)).response.status, 403);

  const reset = await post(url, manager);
  assert.equal(reset.response.status, 200);
  assert.equal(reset.response.headers.get('cache-control'), 'no-store');
  const temporary = reset.body.credentials.temporaryPassword;
  assert.ok(temporary.length >= 8);
  assert.match(temporary, /[A-Z]/); assert.match(temporary, /[a-z]/);
  assert.match(temporary, /[0-9]/); assert.match(temporary, /[^A-Za-z0-9]/);
  assert.equal(reset.body.user.mustChangePassword, true);
  assert.equal(reset.body.user.hasTemporaryPassword, true);
  assert.ok(Date.parse(reset.body.credentials.expiresAt) > Date.now());
  assert.equal(reset.body.email, undefined, 'A manual reset must not pretend to send email');
  assertPrivate(reset.body.user, temporary);
  for (const route of ['/api/users', '/api/users/usr_003', '/api/users/usr_003/audit-log']) {
    const result = await api.request(route, { headers: { cookie: manager } });
    assert.equal(result.response.status, 200);
    assertPrivate(result.body, temporary);
  }
  assert.equal((await api.request('/api/account/me', { headers: { cookie: agent } })).response.status, 401, 'Reset must invalidate an existing session');
  const oldLogin = await post('/api/auth/login', null, { identifier: 'adan@aureum.com', password: 'Rehman@123' });
  assert.equal(oldLogin.response.status, 401);
  const temporaryCookie = await api.login('adan@aureum.com', temporary);
  const blocked = await api.request('/api/dashboard/summary', { headers: { cookie: temporaryCookie } });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
  const permanent = 'AgentPrivatePassword123!';
  const changed = await post('/api/account/change-password', temporaryCookie, { currentPassword: temporary, newPassword: permanent, confirmPassword: permanent });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.user.mustChangePassword, false);
  const profile = await api.request('/api/users/usr_003', { headers: { cookie: manager } });
  assertPrivate(profile.body, temporary); assertPrivate(profile.body, permanent);
  assert.ok(profile.body.auditLogs.some(log => log.action === 'password_reset' && log.actorUserId === 'usr_002'));
  assert.equal((await api.request('/api/dashboard/summary', { headers: { cookie: temporaryCookie } })).response.status, 200);

  const created = await post('/api/users', admin, { fullName: 'Other Team Agent', email: 'other-team@example.test', phone: '03001234567', role: 'sales_agent', teamId: 'team_b', status: 'Active', temporaryPassword: 'OtherTeam123!', sendAccessEmail: false });
  assert.equal(created.response.status, 201);
  const otherUrl = `/api/users/${created.body.user.id}/reset-password`;
  assert.equal((await post(otherUrl, manager)).response.status, 403);
  assert.equal((await post(otherUrl, admin)).response.status, 200);
  assert.equal((await post('/api/users/usr_002/reset-password', admin)).response.status, 200);
  assert.equal((await post('/api/users/usr_001/reset-password', admin)).response.status, 400);
});

test('database reset stores hashes only, scopes manager access, revokes sessions and accepts the replacement', async t => {
  const db = new PGlite(); t.after(() => db.close());
  for (const migration of ['002_production_crm_schema.sql', '003_workspace_settings.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations', migration), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  }
  const sql = { query: async (query, params) => (await db.query(query, params)).rows };
  const repository = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces (name,legacy_id) VALUES ('Password test','password-test') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team-a','Team A') RETURNING id", [workspace.id]);
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const [id, role, teamId] of [['admin','super_admin',null], ['manager','sales_manager',team.id], ['agent','sales_agent',team.id], ['outside','sales_agent',null]]) {
    await sql.query('INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,role_key,team_id,status,password_hash) VALUES ($1,$2,$3,$2,$4,$5,\'active\',$6)', [workspace.id,id,`${id}@example.test`,role,teamId,hash('OldPassword123!')]);
  }
  const view = (_, item) => { const { password_hash, ...safe } = item; return safe; };
  const api = createRelationalApi({ repository, workspaceId: workspace.id, readBody: async req => req.body, json: (res, status, body) => { Object.assign(res, { status, body }); return true; }, passwordHash: hash, passwordPolicySatisfied: value => value.length >= 8, userManagementView: view, publicUser: item => view(null,item) });
  async function call(route, actor, body = {}, method = 'POST') {
    const res = {};
    await api.handle({ method, body }, res, new URL(route, 'http://local.test'), actor);
    return res;
  }
  const manager = await repository.findUser(workspace.id, 'manager');
  const admin = await repository.findUser(workspace.id, 'admin');
  const agent = await repository.findUser(workspace.id, 'agent');
  assert.equal((await call('/api/users/agent/reset-password', agent)).status, 403);
  assert.equal((await call('/api/users/outside/reset-password', manager)).status, 403);
  assert.equal((await call('/api/users/admin/reset-password', manager)).status, 403);
  await repository.createSession({ userId: agent.db_id, token: 'old-session', expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const reset = await call('/api/users/agent/reset-password', manager);
  assert.equal(reset.status, 200);
  const temporary = reset.body.credentials.temporaryPassword;
  assertPrivate(reset.body.user, temporary);
  const stored = await repository.findUser(workspace.id, 'agent');
  assert.equal(stored.password_hash, hash(temporary));
  assert.equal(stored.must_change_password, true);
  assert.equal(stored.has_temporary_password, true);
  assert.equal(stored.access_email_sent_at, null);
  assert.equal(await repository.findSession('old-session', workspace.id), null);
  const audit = await repository.userActivity(workspace.id, 'agent');
  assert.ok(audit.some(log => log.activity_type === 'password_reset'));
  assertPrivate(audit, temporary);
  const blocked = await call('/api/dashboard/summary', stored, {}, 'GET');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
  const changed = await call('/api/account/change-password', stored, { currentPassword: temporary, newPassword: 'PrivatePassword123!', confirmPassword: 'PrivatePassword123!' });
  assert.equal(changed.status, 200);
  const replaced = await repository.findUser(workspace.id, 'agent');
  assert.equal(replaced.has_temporary_password, false);
  assert.equal(replaced.temporary_password_expires_at, null);
  assert.equal(replaced.invite_status, 'Accepted');
  const resetAgain = await call('/api/users/agent/reset-password', admin);
  assert.equal(resetAgain.status, 200);
  assert.notEqual(resetAgain.body.credentials.temporaryPassword, temporary);
  await repository.updateUser(workspace.id, 'agent', { status: 'inactive' });
  assert.equal((await call('/api/users/agent/reset-password', admin)).status, 409);
  assert.equal((await repository.findUser(workspace.id, 'agent')).status, 'inactive');
});
