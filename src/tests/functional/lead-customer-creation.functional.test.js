const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { startApiServer } = require('../helpers/api-test-server');

const schedule = { schedule_followup: true, note: 'Discuss the payment plan next week.', next_due_date: '2099-10-24', next_due_time: '14:35', followup_tag: 'Follow-up' };

test('new leads auto-create customer profiles except Not Interested and Closed Lost', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('adan@aureum.com');
  const request = (url, method = 'GET', body, auth = cookie) => api.request(url, { method, headers: { cookie: auth, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const normal = await request('/api/leads', 'POST', { full_name: 'New relationship', phone: '+923001234567', email: 'new@example.test', interested_in: 'Commercial', city: 'Lahore', tags: ['Investor'] });
  assert.equal(normal.response.status, 201);
  const lead = normal.body.data;
  assert.ok(lead.customer_id);
  const profile = (await request(`/api/customers/${lead.customer_id}`)).body;
  assert.equal(profile.data.lead_id, lead.id);
  assert.equal(profile.data.city, 'Lahore');
  assert.deepEqual(profile.data.tags, ['Investor']);
  const retry = await request(`/api/leads/${lead.id}/customer`, 'POST', { schedule_followup: false });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.created, false);
  assert.equal(retry.body.data.id, lead.customer_id);

  for (const [index, status] of ['Not Interested', 'Closed Lost'].entries()) {
    const closed = await request('/api/leads', 'POST', { full_name: `Closed intake ${index}`, phone: `+9230012345${80 + index}`, interested_in: 'Commercial', status, tags: ['Follow-up', status] });
    assert.equal(closed.response.status, 201);
    assert.equal(closed.body.data.customer_id, null);
    const blocked = await request(`/api/leads/${closed.body.data.id}/customer`, 'POST', {});
    assert.equal(blocked.response.status, 422);
    assert.equal((await request('/api/follow-ups/my')).body.data.some(item => item.lead_id === closed.body.data.id), false);
  }
});

test('Neon lead intake auto-links normal leads and skips terminal statuses/tags', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/002_production_crm_schema.sql'), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/012_opportunity_closure.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/014_edit_saved_notes.sql'), 'utf8'));
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repository = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces (name,legacy_id) VALUES ('Intake test','intake') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team','Team') RETURNING id", [workspace.id]);
  await sql.query("INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES ($1,'agent','agent@example.test','Advisor','test','sales_agent',$2)", [workspace.id, team.id]);
  const actor = { id: 'agent', role: 'sales_agent', team_id: 'team', full_name: 'Advisor', workspace_id: workspace.id };
  const create = input => repository.createLead({ workspaceId: workspace.id, actor, lead: { full_name: input.full_name, phone: input.phone, interested_in: 'Commercial', status: input.status || 'New', tags: input.tags || [], lead_source: 'Manual Entry', assigned_agent_id: 'agent', assigned_team_id: 'team' } });
  const normal = await create({ full_name: 'Auto customer', phone: '+923001234590' });
  assert.ok(normal.customer_id);
  const tagClosed = await create({ full_name: 'Terminal tag', phone: '+923001234591', tags: ['Not Interested'] });
  assert.equal(tagClosed.customer_id, null);
  const statusClosed = await create({ full_name: 'Terminal status', phone: '+923001234592', status: 'Closed Lost' });
  assert.equal(statusClosed.customer_id, null);
  await assert.rejects(repository.createCustomerFromLead(workspace.id, tagClosed.id, actor), /Closed opportunities/);
});

test('all CRM portals create one linked customer from an owned lead', async t => {
  const api = await startApiServer(t);
  const roleCases = [
    { identifier: 'waqas@aureum.com', assigned_agent_id: 'usr_003', listRoute: '/api/customers' },
    { identifier: 'dua@aureum.com', assigned_agent_id: 'usr_003', listRoute: '/api/customers' },
    { identifier: 'adan@aureum.com', listRoute: '/api/customers/my' }
  ];

  for (const [index, roleCase] of roleCases.entries()) {
    const cookie = await api.login(roleCase.identifier);
    const request = (url, method = 'GET', body) => api.request(url, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const leadResult = await request('/api/leads', 'POST', {
      full_name: `Portal conversion ${index}`,
      phone: `+9230012345${70 + index}`,
      interested_in: 'Commercial',
      ...(roleCase.assigned_agent_id ? { assigned_agent_id: roleCase.assigned_agent_id } : {})
    });
    assert.equal(leadResult.response.status, 201);
    const lead = leadResult.body.data;
    const endpoint = `/api/leads/${lead.id}/customer`;
    assert.ok(lead.customer_id);

    const created = await request(endpoint, 'POST', { schedule_followup: false });
    assert.equal(created.response.status, 200);
    assert.equal(created.body.created, false);
    assert.equal(created.body.data.lead_id, lead.id);
    assert.equal(created.body.data.id, lead.customer_id);

    const retry = await request(endpoint, 'POST', { full_name: 'Must not duplicate', schedule_followup: false });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.created, false);
    assert.equal(retry.body.data.id, created.body.data.id);
    assert.equal(retry.body.data.full_name, created.body.data.full_name);

    const visibleCustomers = await request(roleCase.listRoute);
    assert.equal(visibleCustomers.response.status, 200);
    assert.equal(visibleCustomers.body.data.filter(item => item.lead_id === lead.id).length, 1);
    const linkedLead = await request(`/api/leads/${lead.id}`);
    assert.equal(linkedLead.response.status, 200);
    assert.equal(linkedLead.body.data.customer_id, created.body.data.id);
  }
});

test('PostgreSQL creates the linked customer and pending reminder atomically', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/002_production_crm_schema.sql'), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/012_opportunity_closure.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/014_edit_saved_notes.sql'),'utf8'));
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repository = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces (name,legacy_id) VALUES ('Customer test','test') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team','Team') RETURNING id", [workspace.id]);
  const [user] = await sql.query("INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES ($1,'agent','agent@example.test','Advisor','test','sales_agent',$2) RETURNING id", [workspace.id, team.id]);
  const actor = { id: 'agent', role: 'sales_agent', team_id: 'team', full_name: 'Advisor', workspace_id: workspace.id };
  const newLead = async id => (await sql.query("INSERT INTO crm.leads (workspace_id,legacy_id,full_name,phone,assigned_agent_id,assigned_team_id,metadata) VALUES ($1,$2,'New customer','+923001234567',$3,$4,'{\"tags\":[\"Investor\"]}') RETURNING id", [workspace.id, id, user.id, team.id]))[0];
  await newLead('lead');
  assert.equal((await repository.getLead(workspace.id, 'lead')).customer_id, null);
  const result = await repository.createCustomerFromLead(workspace.id, 'lead', actor, { ...schedule, city: 'Lahore', full_name: 'Reviewed name' });
  assert.equal(result.created, true);
  const customer = result.customer;
  assert.equal(customer.full_name, 'Reviewed name');
  assert.equal(customer.city, 'Lahore');
  assert.equal(customer.last_contacted_at, null);
  assert.equal(customer.assigned_agent_id, 'agent');
  assert.deepEqual(customer.tags, ['Investor', 'Follow-up']);
  const lead = await repository.getLead(workspace.id, 'lead');
  assert.equal(lead.customer_id, customer.id);
  assert.equal(lead.last_contacted_at, null);
  assert.ok(lead.next_follow_up_at);
  assert.equal(lead.full_name, 'New customer');
  const [reminder] = await repository.listCustomerFollowUps(workspace.id, customer.id, actor);
  assert.equal(reminder.status, 'Pending');
  assert.equal(reminder.due_date, schedule.next_due_date);
  assert.equal(reminder.due_time, schedule.next_due_time);
  assert.equal(reminder.followup_tag, schedule.followup_tag);
  assert.equal(reminder.notes, schedule.note);
  assert.equal((await repository.listCustomerNotes(workspace.id, customer.id))[0].note, schedule.note);
  assert.ok((await repository.listLeadActivities(workspace.id, 'lead')).some(item => item.activity_type === 'Follow-up scheduled'));
  const retry = await repository.createCustomerFromLead(workspace.id, 'lead', actor, schedule);
  assert.equal(retry.created, false);
  assert.equal(retry.customer.id, customer.id);
  assert.equal((await sql.query('SELECT * FROM crm.follow_ups')).length, 1);
  assert.equal((await sql.query('SELECT * FROM crm.customer_notes')).length, 1);
  await newLead('plain');
  const plain = await repository.createCustomerFromLead(workspace.id, 'plain', actor);
  assert.equal(plain.created, true);
  assert.equal(plain.follow_up_id, null);
  assert.equal((await repository.listCustomerNotes(workspace.id, plain.customer.id)).length, 0);
  assert.equal((await repository.listCustomerFollowUps(workspace.id, plain.customer.id, actor)).length, 0);
  await newLead('invalid');
  await assert.rejects(repository.createCustomerFromLead(workspace.id, 'invalid', actor, { ...schedule, next_due_date: '2099-02-30' }), /valid follow-up date/);
  assert.equal((await repository.getLead(workspace.id, 'invalid')).customer_id, null);
  await db.exec("ALTER TABLE crm.follow_ups ADD CONSTRAINT test_rollback CHECK (notes <> 'Force rollback')");
  await assert.rejects(repository.createCustomerFromLead(workspace.id, 'invalid', actor, { ...schedule, note: 'Force rollback' }), /test_rollback/);
  const rollback = await repository.getLead(workspace.id, 'invalid');
  assert.equal(rollback.customer_id, null);
  assert.equal(rollback.next_follow_up_at, null);
  assert.equal((await sql.query('SELECT * FROM crm.customers')).length, 2);
  assert.equal((await sql.query('SELECT * FROM crm.follow_ups')).length, 1);
  await assert.rejects(repository.createCustomerFromLead(workspace.id, 'invalid', { ...actor, id: 'colleague' }, schedule), /ownership scope/);
});
