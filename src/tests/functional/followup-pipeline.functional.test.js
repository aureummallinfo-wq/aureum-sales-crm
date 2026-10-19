const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { notePlan, displayStatus, uniqueFollowUps } = require('../../../backend/followup-workflow');

test('contact pipeline persists one reminder, note history, and latest activity in PostgreSQL', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const schema = fs.readFileSync(path.join(__dirname,'../../../db/migrations/002_production_crm_schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
  await db.exec(schema);
  const sql = { query: async (text,params) => (await db.query(text,params)).rows };
  const repository = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces (name,legacy_id) VALUES ('Pipeline test','test') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team','Team') RETURNING id",[workspace.id]);
  const [user] = await sql.query("INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES ($1,'agent','agent@example.test','Saqib','test','sales_agent',$2) RETURNING id",[workspace.id,team.id]);
  const actor = {id:'agent',role:'sales_agent',team_id:'team',full_name:'Saqib'};
  const [lead] = await sql.query("INSERT INTO crm.leads (workspace_id,legacy_id,full_name,assigned_agent_id,assigned_team_id) VALUES ($1,'lead','Customer',$2,$3) RETURNING id",[workspace.id,user.id,team.id]);
  const [customer] = await sql.query("INSERT INTO crm.customers (workspace_id,legacy_id,lead_id,full_name,assigned_agent_id,assigned_team_id) VALUES ($1,'customer',$2,'Customer',$3,$4) RETURNING id",[workspace.id,lead.id,user.id,team.id]);
  const [followup] = await sql.query("INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status) VALUES ($1,'followup',$2,$3,$4,$5,'Call',now()-interval '1 day','Pending') RETURNING id",[workspace.id,lead.id,customer.id,user.id,team.id]);

  await t.test('old pending reminder is computed as overdue',async()=>{
    assert.equal((await repository.getFollowUp(workspace.id,'followup')).status,'Overdue');
  });
  await t.test('contact updates same row, records response and sets chosen date/time',async()=>{
    const saved=await repository.addFollowUpNote(workspace.id,'followup',actor,'Customer asked for a revised payment plan.',{customer_contacted:true,next_followup_days:'5',next_due_time:'14:30'});
    assert.equal(saved.id,'followup');assert.equal(saved.status,'Contacted');assert.equal(saved.lifecycle_status,'Rescheduled');
    assert.equal(saved.due_time,'14:30');assert.equal(saved.completed_at,null);
    assert.equal(saved.last_activity_description,'Customer asked for a revised payment plan.');assert.equal(saved.last_activity_by,'Saqib');
    const rows=await sql.query('SELECT * FROM crm.follow_ups');assert.equal(rows.length,1);
    assert.equal(rows[0].due_at.toISOString(),new Date(`${saved.due_date}T14:30:00+05:00`).toISOString());
    assert.equal(saved.reschedule_history.length,1);
    const profile=await repository.getCustomer(workspace.id,'customer');assert.equal(profile.last_activity_description,saved.notes);assert.ok(profile.last_contacted_at);assert.ok(profile.next_follow_up_at);
    assert.equal((await repository.listCustomerNotes(workspace.id,'customer')).length,1);
  });
  await t.test('tags update activity while keeping contact schedule',async()=>{
    const before=await repository.getFollowUp(workspace.id,'followup');
    await repository.updateCustomer(workspace.id,'customer',actor,{tags:['VIP']});
    const after=await repository.getFollowUp(workspace.id,'followup');
    assert.equal(after.due_date,before.due_date);assert.equal(after.due_time,before.due_time);assert.equal(after.status,'Contacted');assert.equal(after.last_activity_description,'Tags: VIP');
    assert.equal((await repository.getLead(workspace.id,'lead')).last_activity_description,'Tags: VIP');
  });
  await t.test('follow-up tag edits and list reads keep the agreed schedule and response',async()=>{
    const before=await repository.getFollowUp(workspace.id,'followup');
    await repository.updateLead(workspace.id,'lead',actor,{tags:['Follow-up']});
    await repository.listFollowUps({workspaceId:workspace.id,user:actor});
    await repository.listFollowUps({workspaceId:workspace.id,user:actor});
    await repository.updateLead(workspace.id,'lead',actor,{tags:[]});
    const after=await repository.getFollowUp(workspace.id,'followup');
    assert.equal(after.due_date,before.due_date);assert.equal(after.due_time,before.due_time);assert.equal(after.notes,before.notes);
    assert.equal(after.last_activity_description,'Tags: None');
    assert.equal((await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups WHERE deleted_at IS NULL'))[0].count,1);
  });
  await t.test('internal note on an overdue row defers it for two days without adding rows',async()=>{
    await sql.query("UPDATE crm.follow_ups SET status='Pending',due_at=now()-interval '1 day',metadata=metadata-'outcome'-'due_date'-'due_time' WHERE id=$1",[followup.id]);
    await repository.addCustomerNote(workspace.id,'customer',actor,'Internal handover note.');
    const saved=await repository.getFollowUp(workspace.id,'followup');
    assert.equal(saved.status,'Rescheduled');assert.equal(saved.last_activity_description,'Internal handover note.');
    const expected=notePlan().schedule;assert.equal(saved.due_date,expected.due_date);
    assert.equal((await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups'))[0].count,1);
  });
  await t.test('rescheduled reminder becomes overdue at its deadline',async()=>{
    const item=await repository.getFollowUp(workspace.id,'followup');
    assert.equal(displayStatus(item,new Date(`${item.due_date}T${item.due_time}:00+05:00`)),'Overdue');
  });
  await t.test('repeated scheduling keeps one row and preserves note history',async()=>{
    await repository.addFollowUpNote(workspace.id,'followup',actor,'Customer confirmed interest.',{customer_contacted:true,next_followup_days:'7'});
    await repository.addFollowUpNote(workspace.id,'followup',actor,'Customer requested a later call.',{customer_contacted:true,next_followup_days:'10'});
    assert.equal((await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups'))[0].count,1);
    assert.equal((await repository.listCustomerNotes(workspace.id,'customer')).length,4);
    assert.equal((await repository.getFollowUp(workspace.id,'followup')).last_activity_description,'Customer requested a later call.');
  });
  await t.test('no next follow-up closes the reminder but keeps Contacted outcome',async()=>{
    const saved=await repository.addFollowUpNote(workspace.id,'followup',actor,'Customer requested no further calls.',{customer_contacted:true,next_followup_days:'none'});
    assert.equal(saved.status,'Contacted');assert.ok(saved.completed_at);assert.equal(saved.lifecycle_status,'Completed');
    assert.equal((await repository.getCustomer(workspace.id,'customer')).next_follow_up_at,null);
  });
  await t.test('a later call reuses the closed reminder instead of creating another row',async()=>{
    await repository.addCustomerNote(workspace.id,'customer',actor,'Customer asked to resume discussions.',{customer_contacted:true,next_followup_days:'3'});
    const saved=await repository.getFollowUp(workspace.id,'followup');
    assert.equal(saved.status,'Contacted');assert.equal(saved.completed_at,null);
    assert.equal((await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups'))[0].count,1);
  });
  await t.test('old duplicate reminders are consolidated with history intact',async()=>{
    await sql.query("INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status,notes) VALUES ($1,'duplicate',$2,$3,$4,$5,'Call',now()-interval '2 days','Pending','Old reminder note')",[workspace.id,lead.id,customer.id,user.id,team.id]);
    await repository.addFollowUpNote(workspace.id,'followup',actor,'One next contact agreed.',{customer_contacted:true,next_followup_days:'custom',next_due_date:'2099-02-28',next_due_time:'15:45'});
    const listed=await repository.listFollowUps({workspaceId:workspace.id,user:actor});assert.equal(listed.length,1);assert.equal(listed[0].id,'followup');
    const duplicates=await sql.query("SELECT * FROM crm.follow_ups WHERE legacy_id='duplicate'");
    assert.equal(duplicates[0].status,'Cancelled');assert.equal(duplicates[0].notes,'Old reminder note');assert.ok(duplicates[0].metadata.consolidated_into);
    assert.equal((await repository.listFollowUpActivities(workspace.id,'duplicate'))[0].activity_type,'Follow-up combined');
    assert.equal((await repository.getFollowUp(workspace.id,'followup')).due_time,'15:45');
  });
  await t.test('rescheduling saves the tag on the reminder, customer and lead without replacing tags', async () => {
    const before = await repository.getCustomer(workspace.id, 'customer');
    const input = { customer_contacted: true, next_followup_days: 'custom', next_due_date: '2099-07-22', next_due_time: '16:40', followup_tag: 'Follow-up' };
    const saved = await repository.addFollowUpNote(workspace.id, 'followup', actor, 'Customer agreed to a tagged contact.', input);
    assert.equal(saved.status, 'Contacted');
    assert.equal(saved.followup_tag, input.followup_tag);
    assert.equal(saved.due_date, input.next_due_date);
    assert.equal(saved.due_time, input.next_due_time);
    const profile = await repository.getCustomer(workspace.id, 'customer');
    for (const tag of [...before.tags, input.followup_tag]) assert.ok(profile.tags.includes(tag));
    assert.ok((await repository.getLead(workspace.id, 'lead')).tags.includes(input.followup_tag));
    await repository.addFollowUpNote(workspace.id, 'followup', actor, 'Repeated scheduling keeps tags unique.', input);
    assert.equal((await repository.getCustomer(workspace.id, 'customer')).tags.filter(tag => tag === input.followup_tag).length, 1);
  });
  await t.test('several status tags persist together on the reminder and both linked profiles', async () => {
    const selected = ['Hot', 'Follow-up', 'Visit Scheduled'];
    await repository.addFollowUpNote(workspace.id, 'followup', actor, 'Visit agreed with a hot prospect.', { customer_contacted: true, next_followup_days: 'custom', next_due_date: '2099-07-23', next_due_time: '16:40', followup_tags: selected });
    assert.deepEqual((await repository.getFollowUp(workspace.id, 'followup')).followup_tags, selected);
    const customer = await repository.getCustomer(workspace.id, 'customer');
    const lead = await repository.getLead(workspace.id, 'lead');
    for (const tag of selected) { assert.ok(customer.tags.includes(tag)); assert.ok(lead.tags.includes(tag)); }
    await repository.updateCustomer(workspace.id, 'customer', actor, { tags: ['Cold', 'No Response'] });
    assert.deepEqual((await repository.getLead(workspace.id, 'lead')).tags, ['Cold', 'No Response']);
    assert.deepEqual((await repository.getFollowUp(workspace.id, 'followup')).followup_tags, ['Cold', 'No Response']);
  });
  await t.test('Add note records follow-up history without changing status, schedule or last contacted', async () => {
    const before = await repository.getFollowUp(workspace.id, 'followup');
    const profile = await repository.getCustomer(workspace.id, 'customer');
    const saved = await repository.addFollowUpNote(workspace.id, 'followup', actor, 'Internal preparation for the next call.', { customer_contacted: false, next_followup_days: 'none' });
    assert.equal(saved.status, 'Contacted');
    assert.equal(saved.due_date, before.due_date);
    assert.equal(saved.due_time, before.due_time);
    assert.equal(saved.followup_tag, before.followup_tag);
    assert.equal(saved.reschedule_history.length, before.reschedule_history.length);
    assert.equal((await repository.getCustomer(workspace.id, 'customer')).last_contacted_at, profile.last_contacted_at);
    assert.equal((await repository.listFollowUpActivities(workspace.id, 'followup'))[0].activity_type, 'Note added');
    await sql.query("UPDATE crm.follow_ups SET due_at=now()-interval '1 day',metadata=metadata-'due_date'-'due_time' WHERE id=$1", [followup.id]);
    const overdue = await repository.getFollowUp(workspace.id, 'followup');
    const note = await repository.addFollowUpNote(workspace.id, 'followup', actor, 'Still awaiting a call.', { customer_contacted: false, next_followup_days: 'none' });
    assert.equal(note.status, 'Overdue');
    assert.equal(note.due_date, overdue.due_date);
    assert.equal(note.due_time, overdue.due_time);
    assert.equal((await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups'))[0].count, 2);
  });
  await t.test('a customer with no reminder gets their first tagged follow-up', async () => {
    const [newLead] = await sql.query("INSERT INTO crm.leads (workspace_id,legacy_id,full_name,assigned_agent_id,assigned_team_id) VALUES ($1,'new-lead','New Customer',$2,$3) RETURNING id", [workspace.id, user.id, team.id]);
    await sql.query("INSERT INTO crm.customers (workspace_id,legacy_id,lead_id,full_name,assigned_agent_id,assigned_team_id) VALUES ($1,'new-customer',$2,'New Customer',$3,$4)", [workspace.id, newLead.id, user.id, team.id]);
    const note = await repository.addCustomerNote(workspace.id, 'new-customer', actor, 'First contact agreed.', { customer_contacted: true, next_followup_days: 'custom', next_due_date: '2099-08-23', next_due_time: '11:25', followup_tag: 'Follow-up' });
    assert.ok(note.next_follow_up_id);
    const rows = await repository.listFollowUps({ workspaceId: workspace.id, user: actor, customerId: 'new-customer' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'Contacted');
    assert.equal(rows[0].followup_tag, 'Follow-up');
    assert.equal(rows[0].due_date, '2099-08-23');
    assert.equal(rows[0].due_time, '11:25');
    assert.ok((await repository.getCustomer(workspace.id, 'new-customer')).tags.includes('Follow-up'));
  });
});

test('note plans validate future dates and list grouping keeps one row per customer',()=>{
  const now=new Date('2026-10-18T12:00:00Z');
  for(const days of [1,2,3,5,7,10]) assert.equal(notePlan({next_followup_days:days},now).schedule.due_date,`2026-10-${18+days}`);
  assert.throws(()=>notePlan({next_followup_days:'custom',next_due_date:'2026-02-30',next_due_time:'10:00'},now));
  assert.throws(()=>notePlan({next_followup_days:'custom',next_due_date:'2026-10-17',next_due_time:'10:00'},now));
  assert.throws(()=>notePlan({next_followup_days:'100'},now));
  assert.equal(uniqueFollowUps([{id:'a',customer_id:'customer',status:'Cancelled'},{id:'b',customer_id:'customer',status:'Pending'}])[0].id,'b');
});
