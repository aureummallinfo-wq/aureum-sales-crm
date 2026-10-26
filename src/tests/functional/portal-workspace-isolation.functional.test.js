const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { startApiServer } = require('../helpers/api-test-server');

test('a stale browser tab cannot read, write, or sign out a different agent session', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('saqib@aureum.com', 'Rao@1234');
  const displayedAgent = JSON.stringify(['', 'usr_003', 'sales_agent', 'team_a']);
  const staleHeaders = { cookie, 'content-type': 'application/json', 'x-aureum-portal-scope': displayedAgent };
  for (const route of ['/api/dashboard/today-follow-ups', '/api/follow-ups/my', '/api/customers/my']) {
    const result = await api.request(route, { headers: staleHeaders });
    assert.equal(result.response.status, 409);
    assert.equal(result.body.code, 'PORTAL_SESSION_CHANGED');
    assert.equal(result.body.data, undefined);
  }
  const blockedWrite = await api.request('/api/leads', { method: 'POST', headers: staleHeaders, body: JSON.stringify({ full_name: 'Blocked stale-tab lead', phone: '03001234099' }) });
  assert.equal(blockedWrite.response.status, 409);
  const blockedLogout = await api.request('/api/auth/logout', { method: 'POST', headers: staleHeaders });
  assert.equal(blockedLogout.response.status, 409);
  const validHeaders = { cookie, 'x-aureum-portal-scope': JSON.stringify(['', 'usr_004', 'sales_agent', 'team_a']) };
  const me = await api.request('/api/auth/me', { headers: validHeaders });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.id, 'usr_004');
  const leads = await api.request('/api/leads/my', { headers: validHeaders });
  assert.equal(leads.response.status, 200);
  assert.ok(leads.body.data.every(item => item.assigned_agent_id === 'usr_004'));
  assert.equal(leads.body.data.some(item => item.full_name === 'Blocked stale-tab lead'), false);
});

test('workspace sessions and follow-ups remain separate with matching legacy identifiers', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const schema = fs.readFileSync(path.join(__dirname, '../../../db/migrations/002_production_crm_schema.sql'), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await db.exec(schema);
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/012_opportunity_closure.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/003_workspace_settings.sql'), 'utf8'));
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repository = createNeonRepository(sql);
  const workspaces = [];
  for (const name of ['Lahore', 'Islamabad']) {
    const [workspace] = await sql.query('INSERT INTO crm.workspaces (name,legacy_id) VALUES ($1,$1) RETURNING id', [name]);
    const [team] = await sql.query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team','Sales') RETURNING id", [workspace.id]);
    const agents = [];
    for (const legacy of ['agent-a', 'agent-b']) {
      const [user] = await sql.query("INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES ($1,$2,$3,$2,'test','sales_agent',$4) RETURNING id", [workspace.id, legacy, `${legacy}@${name.toLowerCase()}.test`, team.id]);
      agents.push(user);
      const [lead] = await sql.query('INSERT INTO crm.leads (workspace_id,legacy_id,full_name,assigned_agent_id,assigned_team_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [workspace.id, `lead-${legacy}`, `${name} ${legacy}`, user.id, team.id]);
      const [customer] = await sql.query('INSERT INTO crm.customers (workspace_id,legacy_id,lead_id,full_name,assigned_agent_id,assigned_team_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [workspace.id, `customer-${legacy}`, lead.id, `${name} ${legacy}`, user.id, team.id]);
      await sql.query("INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status) VALUES ($1,$2,$3,$4,$5,$6,'Call',now()+interval '1 day','Pending')", [workspace.id, `followup-${legacy}`, lead.id, customer.id, user.id, team.id]);
    }
    workspaces.push({ ...workspace, agents });
  }
  await repository.createSession({ userId: workspaces[0].agents[0].id, token: 'workspace-a-session', expiresAt: new Date(Date.now() + 3600000) });
  assert.equal(await repository.workspaceId('Lahore'), workspaces[0].id);
  assert.equal(await repository.workspaceId('Islamabad'), workspaces[1].id);
  assert.equal(await repository.workspaceId('unknown-city'), null);
  assert.equal((await repository.findSession('workspace-a-session', workspaces[0].id)).workspace_id, workspaces[0].id);
  assert.equal(await repository.findSession('workspace-a-session', workspaces[1].id), null);
  assert.equal(await repository.findSession('workspace-a-session'), null);
  await repository.revokeSession('workspace-a-session', workspaces[1].id);
  assert.ok(await repository.findSession('workspace-a-session', workspaces[0].id));
  await repository.revokeSession('workspace-a-session', workspaces[0].id);
  assert.equal(await repository.findSession('workspace-a-session', workspaces[0].id), null);

  for (const [index, workspace] of workspaces.entries()) {
    const rows = await repository.listFollowUps({ workspaceId: workspace.id, user: { id: 'agent-a', role: 'sales_agent', team_id: 'team' } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].assigned_agent_id, 'agent-a');
    assert.equal(rows[0].lead_name, `${index === 0 ? 'Lahore' : 'Islamabad'} agent-a`);
    const all = await repository.listFollowUps({ workspaceId: workspace.id, user: { role: 'super_admin' } });
    assert.equal(all.length, 2);
    assert.ok(all.every(item => item.lead_name.startsWith(index === 0 ? 'Lahore' : 'Islamabad')));
  }
});
