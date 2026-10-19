const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { startApiServer } = require('../helpers/api-test-server');

const schedule = { schedule_followup: true, note: 'Discuss the payment plan next week.', next_due_date: '2099-10-24', next_due_time: '14:35', followup_tag: 'Follow-up Needed' };

test('lead drawer customer creation API validates, preserves ownership, and prevents duplicates', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('adan@aureum.com');
  const request = (url, method = 'GET', body, auth = cookie) => api.request(url, { method, headers: { cookie: auth, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const createdLead = await request('/api/leads', 'POST', { full_name: 'New relationship', phone: '+923001234567', email: 'new@example.test', interested_in: 'Commercial', city: 'Lahore', tags: ['Investor'] });
  const lead = createdLead.body.data;
  assert.equal(lead.customer_id, null);
  const endpoint = `/api/leads/${lead.id}/customer`;
  const unauth = await api.request(endpoint, { method: 'POST' });
  assert.equal(unauth.response.status, 401);
  for (const invalid of [
    { ...schedule, next_due_date: '2099-02-30' },
    { ...schedule, next_due_date: '2020-01-01' },
    { ...schedule, note: '' },
    { ...schedule, followup_tag: 'Invented tag' },
    { full_name: '' }, { phone: 'bad' }, { email: 'bad' }
  ]) {
    assert.equal((await request(endpoint, 'POST', invalid)).response.status, 422);
    assert.equal((await request(`/api/leads/${lead.id}`)).body.data.customer_id, null);
  }
  const colleague = await api.login('saqib@aureum.com', 'Rao@1234');
  assert.equal((await request(endpoint, 'POST', schedule, colleague)).response.status, 403);
  const result = await request(endpoint, 'POST', { ...schedule, full_name: 'Reviewed customer name', city: 'Islamabad', tags: ['Investor'], assigned_agent_id: 'usr_004', customer_contacted: true });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.created, true);
  assert.ok(result.body.follow_up_id);
  const profile = (await request(`/api/customers/${result.body.data.id}`)).body;
  assert.equal(profile.data.full_name, 'Reviewed customer name');
  assert.equal(profile.data.phone, lead.phone);
  assert.equal(profile.data.city, 'Islamabad');
  assert.equal(profile.data.lead_id, lead.id);
  assert.equal(profile.data.assigned_agent_id, lead.assigned_agent_id);
  assert.equal(profile.data.last_contacted_at, lead.last_contacted_at);
  assert.deepEqual(profile.data.tags, ['Investor', 'Follow-up Needed']);
  assert.equal(profile.notes[0].note, schedule.note);
  const followups = (await request('/api/follow-ups/my')).body.data.filter(item => item.customer_id === profile.data.id);
  assert.equal(followups.length, 1);
  assert.equal(followups[0].status, 'Pending');
  assert.equal(followups[0].due_date, schedule.next_due_date);
  assert.equal(followups[0].due_time, schedule.next_due_time);
  assert.equal(followups[0].followup_tag, schedule.followup_tag);
  const updatedLead = (await request(`/api/leads/${lead.id}`)).body.data;
  assert.equal(updatedLead.customer_id, profile.data.id);
  assert.equal(updatedLead.status, lead.status);
  assert.equal(updatedLead.last_contacted_at, lead.last_contacted_at);
  const retry = await request(endpoint, 'POST', { ...schedule, full_name: 'Do not overwrite' });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.created, false);
  assert.equal(retry.body.data.id, profile.data.id);
  assert.equal(retry.body.data.full_name, 'Reviewed customer name');
  assert.equal((await request(`/api/customers/${profile.data.id}`)).body.notes.length, 1);
  assert.equal((await request('/api/follow-ups/my')).body.data.filter(item => item.customer_id === profile.data.id).length, 1);
  const plain = (await request('/api/leads', 'POST', { full_name: 'Customer only', phone: '+923001234568', interested_in: 'Commercial' })).body.data;
  const plainCustomer = await request(`/api/leads/${plain.id}/customer`, 'POST', { schedule_followup: false });
  assert.equal(plainCustomer.response.status, 201);
  const plainDetail = (await request(`/api/customers/${plainCustomer.body.data.id}`)).body;
  assert.equal(plainDetail.notes.length, 0);
  assert.equal(plainDetail.followUps.length, 0);
  assert.equal(plainDetail.data.last_contacted_at, plain.last_contacted_at);
});

test('PostgreSQL creates the linked customer and pending reminder atomically', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/002_production_crm_schema.sql'), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
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
  assert.deepEqual(customer.tags, ['Investor', 'Follow-up Needed']);
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
