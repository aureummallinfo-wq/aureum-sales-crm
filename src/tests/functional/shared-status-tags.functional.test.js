const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { startApiServer } = require('../helpers/api-test-server');
const policy = require('../../../frontend/shared/crm-status-tags');

test('multiple status tags synchronize the follow-up, lead and customer and reject retired values', async t => {
  const api = await startApiServer(t);
  const agent = await api.login('adan@aureum.com');
  const admin = await api.login('waqas@aureum.com');
  const request = (url, method = 'GET', body, cookie = agent) => api.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const type of ['lead-statuses', 'customer-statuses', 'lead-tags']) {
    const result = await request(`/api/settings/${type}`, 'GET', null, admin);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.filter(item => item.is_active).map(item => item.name), policy.values);
  }
  const leadResult = await request('/api/leads', 'POST', { full_name: 'Status tag customer', phone: '+923001112233', interested_in: 'Commercial', status: 'New' });
  assert.equal(leadResult.response.status, 201);
  const lead = leadResult.body.data;
  const converted = await request(`/api/leads/${lead.id}/customer`, 'POST', {});
  assert.equal(converted.response.status, 201);
  const customer = converted.body.data;
  const selected = ['Hot', 'Follow-up', 'Visit Scheduled'];
  const saved = await request(`/api/customers/${customer.id}/notes`, 'POST', { note: 'Customer confirmed a site visit.', customer_contacted: true, next_followup_days: 'custom', next_due_date: '2099-10-24', next_due_time: '14:30', followup_tags: selected });
  assert.equal(saved.response.status, 201);
  assert.deepEqual((await request(`/api/leads/${lead.id}`)).body.data.tags, selected);
  assert.deepEqual((await request(`/api/customers/${customer.id}`)).body.data.tags, selected);
  const reminder = (await request('/api/follow-ups/my')).body.data.find(item => item.customer_id === customer.id);
  assert.deepEqual(reminder.followup_tags, selected);
  assert.equal(reminder.lead_status, 'New');
  await request(`/api/customers/${customer.id}/status`, 'PATCH', { status: 'Hot' });
  assert.equal((await request(`/api/leads/${lead.id}`)).body.data.status, 'Hot');
  await request(`/api/leads/${lead.id}/status`, 'PATCH', { status: 'Not Interested' });
  assert.equal((await request(`/api/customers/${customer.id}`)).body.data.customer_status, 'Closed Lost');
  const invalid = await request(`/api/customers/${customer.id}/notes`, 'POST', { note: 'Do not save.', next_followup_days: 'none', followup_tag: 'VIP' });
  assert.equal(invalid.response.status, 422);
  assert.equal((await request(`/api/leads/${lead.id}`)).body.data.status, 'Closed Lost');
  assert.equal((await request(`/api/leads/${lead.id}/status`, 'PATCH', { status: 'Closed Lost' })).response.status, 200);
  const updated = await request(`/api/customers/${customer.id}`, 'PATCH', { tags: policy.values });
  assert.equal(updated.response.status, 200);
  assert.equal((await request(`/api/leads/${lead.id}`)).body.data.status,'Closed Lost');
  assert.equal((await request(`/api/follow-ups/${reminder.id}`)).body.data.status,'Cancelled');
  assert.equal((await request('/api/follow-ups/my')).body.data.some(item=>item.id===reminder.id),false);
  await request(`/api/leads/${lead.id}`, 'PATCH', { tags: ['Cold', 'No Response'] });
  assert.deepEqual((await request(`/api/customers/${customer.id}`)).body.data.tags, ['Cold', 'No Response']);
});

test('status migration preserves original labels and retires old definitions without deleting records', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const migration = name => fs.readFileSync(path.resolve(__dirname, '../../../db/migrations', name), 'utf8');
  await db.exec(migration('002_production_crm_schema.sql').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  await db.exec(migration('003_workspace_settings.sql'));
  await db.exec(migration('008_customer_statuses.sql'));
  const [workspace] = (await db.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Legacy statuses','status-migration') RETURNING id")).rows;
  const [old] = (await db.query("INSERT INTO crm.lead_statuses(workspace_id,name,slug) VALUES($1,'Closed Lost','closed-lost') RETURNING id", [workspace.id])).rows;
  const [lead] = (await db.query("INSERT INTO crm.leads(workspace_id,full_name,status_id) VALUES($1,'Original record',$2) RETURNING id", [workspace.id, old.id])).rows;
  await db.query("INSERT INTO crm.customers(workspace_id,lead_id,full_name,customer_status) VALUES($1,$2,'Original record','Active')", [workspace.id, lead.id]);
  await db.exec(migration('009_shared_crm_status_tags.sql'));
  await db.exec(migration('009_shared_crm_status_tags.sql'));
  await db.exec(migration('011_expand_crm_status_tags.sql'));
  const leads = (await db.query('SELECT l.metadata,s.name FROM crm.leads l JOIN crm.lead_statuses s ON s.id=l.status_id')).rows;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, 'Not Interested');
  assert.equal(leads[0].metadata.previous_status, 'Closed Lost');
  const customers = (await db.query('SELECT customer_status,metadata FROM crm.customers')).rows;
  assert.equal(customers.length, 1);
  assert.equal(customers[0].customer_status, 'New');
  assert.equal(customers[0].metadata.previous_status, 'Active');
  for (const table of ['lead_statuses', 'customer_statuses', 'lead_tags']) {
    const rows = (await db.query(`SELECT name FROM crm.${table} WHERE is_active=true ORDER BY array_position($1::text[],name)`, [policy.values])).rows;
    assert.deepEqual(rows.map(item => item.name), policy.values);
  }
  assert.equal((await db.query('SELECT is_active FROM crm.lead_statuses WHERE id=$1', [old.id])).rows[0].is_active, true);
});
