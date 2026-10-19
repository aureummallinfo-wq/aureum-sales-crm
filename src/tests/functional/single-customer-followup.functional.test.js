const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { uniqueFollowUps } = require('../../../backend/followup-workflow');
const { startApiServer } = require('../helpers/api-test-server');

test('customer and follow-up scheduling routes keep the same reminder after repeated saves and completion', async t => {
  const api = await startApiServer(t);
  const cookie = await api.login('adan@aureum.com');
  const request = (url, method = 'GET', body) => api.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const lead = (await request('/api/leads', 'POST', { full_name:'Single reminder', phone:'+923001234567', interested_in:'Commercial' })).body.data;
  const customer = (await request(`/api/leads/${lead.id}/customer`, 'POST', {})).body.data;
  const endpoint = `/api/customers/${customer.id}/follow-ups`;
  const first = await request(endpoint,'POST',{due_date:'2099-10-24',due_time:'14:35',note:'First schedule'});
  const id = first.body.followUp.id;
  assert.ok(id);
  const repeats = await Promise.all([1,2,3].map(index => request(endpoint,'POST',{due_date:'2099-10-25',due_time:'15:00',note:`Schedule ${index}`})));
  for (const repeat of repeats) assert.equal(repeat.body.followUp.id,id);
  const direct = await request('/api/follow-ups','POST',{customer_id:customer.id,due_date:'2099-10-26',due_time:'16:00',note:'Direct schedule'});
  assert.equal(direct.body.data.id,id);
  const completed = await request(`/api/follow-ups/${id}/complete`,'PATCH',{note:'Conversation completed'});
  assert.equal(completed.response.status,200);
  const reopened = await request(endpoint,'POST',{due_date:'2099-10-27',due_time:'17:00',note:'Next conversation'});
  assert.equal(reopened.body.followUp.id,id);
  assert.equal(reopened.body.followUp.completed_at,null);
  const profile = (await request(`/api/customers/${customer.id}`)).body;
  assert.equal(profile.followUps.length,1);
  assert.equal(profile.followUps[0].due_date,'2099-10-27');
  assert.equal((await request(endpoint)).body.data.length,1);
  assert.equal((await request('/api/follow-ups/my')).body.data.filter(item => item.customer_id === customer.id).length,1);
  const activity = (await request(`/api/follow-ups/${id}`)).body.activity;
  assert.ok(activity.some(item => item.description === 'First schedule'));
  assert.ok(activity.some(item => item.description === 'Next conversation'));
});

test('database concurrent schedules, contact notes, and customer conversion reuse one reminder', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/002_production_crm_schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/003_workspace_settings.sql'),'utf8'));
  let barrierEnabled = false;
  let arrivals = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const sql = { query: async (text,params) => {
    const rows = (await db.query(text,params)).rows;
    if (barrierEnabled && text.startsWith('SELECT id,legacy_id FROM crm.follow_ups')) {
      arrivals += 1;
      if (arrivals === 2) { barrierEnabled = false; release(); }
      await barrier;
    }
    return rows;
  } };
  const repository = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces (name,legacy_id) VALUES ('Single reminder','test') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team','Team') RETURNING id",[workspace.id]);
  const [user] = await sql.query("INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES ($1,'agent','agent@example.test','Advisor','test','sales_agent',$2) RETURNING id",[workspace.id,team.id]);
  const actor = {id:'agent',role:'sales_agent',team_id:'team',full_name:'Advisor',workspace_id:workspace.id};
  const newLead = async id => (await sql.query("INSERT INTO crm.leads (workspace_id,legacy_id,full_name,phone,assigned_agent_id,assigned_team_id) VALUES ($1,$2,'Customer','+923001234567',$3,$4) RETURNING id",[workspace.id,id,user.id,team.id]))[0];
  const lead = await newLead('lead');
  const {customer} = await repository.createCustomerFromLead(workspace.id,'lead',actor);
  const input = {customer_id:customer.id,due_date:'2099-10-24',due_time:'14:35',notes:'First schedule'};
  barrierEnabled = true;
  const schedules = await Promise.all([repository.createFollowUp(workspace.id,actor,input),repository.createFollowUp(workspace.id,actor,{...input,notes:'Concurrent schedule'})]);
  assert.equal(arrivals,2,'force both requests to observe no reminder before insertion');
  assert.equal(schedules[0].id,schedules[1].id);
  assert.equal((await sql.query('SELECT * FROM crm.follow_ups')).length,1);
  const id = schedules[0].id;
  await repository.transitionFollowUp(workspace.id,id,actor,'Completed');
  const reopened = await repository.createFollowUp(workspace.id,actor,{...input,due_time:'16:00',notes:'Reopened'});
  assert.equal(reopened.id,id);
  assert.equal(reopened.completed_at,null);
  assert.equal((await sql.query('SELECT * FROM crm.follow_ups')).length,1);
  await sql.query("INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status,notes) VALUES ($1,'old-duplicate',$2,$3,$4,$5,'Call','2099-11-01','Pending','Keep historical note')",[workspace.id,lead.id,await repository.resolveCustomerId(workspace.id,customer.id),user.id,team.id]);
  await repository.createFollowUp(workspace.id,actor,{...input,due_date:'2099-10-26'});
  const duplicate = (await sql.query("SELECT * FROM crm.follow_ups WHERE legacy_id='old-duplicate'"))[0];
  assert.equal(duplicate.status,'Cancelled');
  assert.ok(duplicate.metadata.consolidated_into);
  assert.equal(duplicate.notes,'Keep historical note');
  assert.equal((await repository.listCustomerFollowUps(workspace.id,customer.id,actor)).length,1);
  const contactLead = await newLead('contact');
  const contactCustomer = (await repository.createCustomerFromLead(workspace.id,'contact',actor)).customer;
  await Promise.all([1,2].map(index => repository.addCustomerNote(workspace.id,contactCustomer.id,actor,`Contact ${index}`,{customer_contacted:true,next_followup_days:'custom',next_due_date:'2099-10-24',next_due_time:'10:00'})));
  assert.equal((await sql.query('SELECT * FROM crm.follow_ups WHERE lead_id=$1',[contactLead.id])).length,1);
  assert.equal((await repository.listCustomerNotes(workspace.id,contactCustomer.id)).length,2);
  const orphan = await newLead('orphan');
  const [old] = await sql.query("INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status,notes) VALUES ($1,'lead-only-reminder',$2,$3,$4,'Call','2099-10-24','Pending','Existing lead reminder') RETURNING id",[workspace.id,orphan.id,user.id,team.id]);
  const converted = await repository.createCustomerFromLead(workspace.id,'orphan',actor,{schedule_followup:true,note:'Follow up after conversion',next_due_date:'2099-10-25',next_due_time:'12:00',followup_tag:'Follow-up Needed'});
  assert.equal(converted.follow_up_id,'lead-only-reminder');
  const orphanRows = await sql.query('SELECT * FROM crm.follow_ups WHERE lead_id=$1',[orphan.id]);
  assert.equal(orphanRows.length,1);
  assert.equal(orphanRows[0].id,old.id);
  assert.equal(orphanRows[0].customer_id,await repository.resolveCustomerId(workspace.id,converted.customer.id));
});

test('screen grouping hides combined history without grouping customers across workspaces or by name', () => {
  const rows = uniqueFollowUps([
    {id:'a',workspace_id:'one',customer_id:'same',customer_name:'Same name',status:'Pending'},
    {id:'combined',workspace_id:'one',customer_id:'same',status:'Cancelled',consolidated_into:'a'},
    {id:'b',workspace_id:'two',customer_id:'same',customer_name:'Same name',status:'Pending'},
    {id:'c',workspace_id:'one',customer_id:'different',customer_name:'Same name',status:'Pending'}
  ]);
  assert.deepEqual(rows.map(item => item.id),['a','b','c']);
});
