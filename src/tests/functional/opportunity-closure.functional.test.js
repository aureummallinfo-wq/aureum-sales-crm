const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { deliverOutboxItem } = require('../../../backend/outbox-delivery');
const { syncCrmSnapshot } = require('../../../backend/db/neon-state-sync');

test('opportunity closure is atomic, scoped, idempotent and preserves history', async t => {
  const db = new PGlite(); t.after(() => db.close());
  for (const file of ['002_production_crm_schema.sql','003_workspace_settings.sql','012_opportunity_closure.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations',file),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  }
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/014_edit_saved_notes.sql'),'utf8'));
  const sql = {query: async (text,params) => (await db.query(text,params)).rows};
  const repo = createNeonRepository(sql);
  const [w] = await sql.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Isolated closure test','closure') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams(workspace_id,legacy_id,name) VALUES($1,'team','Test team') RETURNING id",[w.id]);
  const actors = {};
  for (const role of ['super_admin','sales_manager','sales_agent']) {
    const [u] = await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES($1,$2,$3,$2,'fixture-only',$2,$4) RETURNING id",[w.id,role,role+'@example.test',team.id]);
    actors[role]={id:role,role,team_id:'team',full_name:role,dbId:u.id};
  }
  for (const name of ['New','Closed Lost','Not Interested']) await sql.query('INSERT INTO crm.lead_statuses(workspace_id,name,slug) VALUES($1,$2,$3)',[w.id,name,name.toLowerCase().replaceAll(' ','-')]);
  await sql.query("INSERT INTO crm.notification_definitions(event_key,event_name) VALUES('follow_up_due','Due') ON CONFLICT DO NOTHING");
  const fixtures=[];
  for (const n of [1,2,3]) {
    const [l]=await sql.query("INSERT INTO crm.leads(workspace_id,legacy_id,full_name,email,assigned_agent_id,assigned_team_id,status_id) VALUES($1,$2,'Same person','same@example.test',$3,$4,(SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND name='New')) RETURNING id",[w.id,'lead'+n,actors.sales_agent.dbId,team.id]);
    const [c]=await sql.query("INSERT INTO crm.customers(workspace_id,legacy_id,lead_id,full_name,assigned_agent_id,assigned_team_id,customer_status) VALUES($1,$2,$3,'Same person',$4,$5,'New') RETURNING id",[w.id,'customer'+n,l.id,actors.sales_agent.dbId,team.id]);
    for(const status of ['Pending','Completed']) await sql.query("INSERT INTO crm.follow_ups(workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status,notes) VALUES($1,$2,$3,$4,$5,$6,'Call',now()+interval '1 day',$7,'Preserved history')",[w.id,'f'+n+status,l.id,c.id,actors.sales_agent.dbId,team.id,status]);
    const [f]=await sql.query("SELECT id FROM crm.follow_ups WHERE legacy_id=$1",['f'+n+'Pending']);
    await sql.query("INSERT INTO crm.outbox_events(workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) VALUES($1,'follow_up_created','follow_up',$2,'{}',$3)",[w.id,f.id,'outbox'+n]);
    await sql.query("INSERT INTO crm.notifications(user_id,event_key,title,message,related_entity_type,related_entity_id,dedupe_key) VALUES($1,'follow_up_due','Due','Call','follow_up',$2,$3)",[actors.sales_agent.dbId,f.id,'notification'+n]);
    fixtures.push({l,c,f});
  }
  await t.test('agent closes only owned opportunity and both screens read canonical status',async()=>{
    const saved=await repo.updateLead(w.id,'lead1',actors.sales_agent,{status:'Not Interested',closure_reason:'No longer buying',city:'Updated city',priority:'High'});
    assert.equal(saved.status,'Closed Lost'); assert.equal(saved.closure_reason,'No longer buying'); assert.equal(saved.next_follow_up_at,null);
    assert.equal(saved.city,'Updated city'); assert.equal(saved.priority,'High');
    assert.equal((await repo.getCustomer(w.id,'customer1')).customer_status,'Closed Lost');
    assert.equal((await repo.getLead(w.id,'lead2')).status,'New');
    assert.equal((await repo.getFollowUp(w.id,'f1Completed')).lifecycle_status,'Completed');
    assert.equal((await repo.getFollowUp(w.id,'f1Pending')).lifecycle_status,'Cancelled');
    assert.equal((await repo.listFollowUps({workspaceId:w.id,user:actors.sales_agent})).some(f=>f.lead_id==='lead1'),false);
    assert.equal((await repo.listCustomerFollowUpHistory(w.id,'customer1',actors.sales_agent)).length,2);
    assert.equal((await repo.listLeads({workspaceId:w.id,user:actors.sales_agent,search:'same@example.test'})).length,3);
    assert.equal((await sql.query('SELECT cancelled_at FROM crm.outbox_events WHERE idempotency_key=$1',['outbox1']))[0].cancelled_at instanceof Date,true);
    assert.equal((await repo.listNotifications(w.id,'sales_agent')).some(n=>n.dedupe_key==='notification1'),false);
  });
  await t.test('duplicate closure does not duplicate audit or increment version',async()=>{
    await Promise.all([repo.changeLeadStatus(w.id,'lead1',actors.sales_agent,'Not Interested'),repo.changeCustomerStatus(w.id,'customer1',actors.sales_manager,'Not Interested')]);
    assert.equal((await repo.getLead(w.id,'lead1')).lifecycle_version,1);
    assert.equal((await sql.query("SELECT * FROM crm.audit_events WHERE action='opportunity_closed_lost'")).length,1);
  });
  await t.test('closed opportunities reject schedules and retain ordinary notes',async()=>{
    await assert.rejects(repo.createFollowUp(w.id,actors.sales_agent,{customer_id:'customer1',due_date:'2099-01-01',due_time:'10:00'}),/Closed opportunity/);
    await assert.rejects(repo.updateFollowUp(w.id,'f1Pending',actors.sales_agent,{due_date:'2099-01-01',reopen:true}),/Cancelled follow-up/);
    await repo.addCustomerNote(w.id,'customer1',actors.sales_agent,'Searchable closure note',{next_followup_days:'none'});
    assert.equal((await repo.listCustomerNotes(w.id,'customer1'))[0].note,'Searchable closure note');
    await assert.rejects(repo.addCustomerNote(w.id,'customer1',actors.sales_agent,'Must not persist',{next_followup_days:'3',customer_contacted:true}),/Reactivate/);
    assert.equal((await repo.listCustomerNotes(w.id,'customer1')).length,1);
    await sql.query("UPDATE crm.leads SET next_follow_up_at=now()+interval '1 day' WHERE id=$1",[fixtures[0].l.id]);
    assert.equal((await repo.getLead(w.id,'lead1')).next_follow_up_at,null);
  });
  await t.test('failed audit rolls back status, cancellation, outbox and history',async()=>{
    await db.exec("CREATE FUNCTION crm.fail_closure_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$; CREATE TRIGGER fail_closure_audit BEFORE INSERT ON crm.audit_events FOR EACH ROW EXECUTE FUNCTION crm.fail_closure_audit();");
    await assert.rejects(repo.changeCustomerStatus(w.id,'customer2',actors.sales_manager,'Not Interested'),/injected audit failure/);
    assert.equal((await repo.getLead(w.id,'lead2')).status,'New');
    assert.equal((await repo.getCustomer(w.id,'customer2')).customer_status,'New');
    assert.equal((await repo.getFollowUp(w.id,'f2Pending')).lifecycle_status,'Pending');
    assert.equal((await sql.query("SELECT cancelled_at FROM crm.outbox_events WHERE idempotency_key='outbox2'"))[0].cancelled_at,null);
    await db.exec('DROP TRIGGER fail_closure_audit ON crm.audit_events');
  });
  await t.test('manager closes through Customers; agent and team scope are enforced in SQL',async()=>{
    await repo.updateCustomer(w.id,'customer2',actors.sales_manager,{tags:['Not Interested'],city:'Customer city',full_name:'Updated name'});
    assert.equal((await repo.getLead(w.id,'lead2')).status,'Closed Lost');
    assert.equal((await repo.getCustomer(w.id,'customer2')).city,'Customer city');
    assert.equal((await repo.getCustomer(w.id,'customer2')).full_name,'Updated name');
    const [other]=await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key) VALUES($1,'other','other@example.test','Other','fixture','sales_agent') RETURNING id",[w.id]);
    await assert.rejects(sql.query('SELECT crm.transition_opportunity($1,$2,$3,$4,$5)',[w.id,fixtures[2].l.id,other.id,'Closed Lost','Not Interested']),/ownership/);
    await sql.query("UPDATE crm.users SET role_key='sales_manager' WHERE id=$1",[other.id]);
    await assert.rejects(sql.query('SELECT crm.transition_opportunity($1,$2,$3,$4,$5)',[w.id,fixtures[2].l.id,other.id,'Closed Lost','Not Interested']),/ownership/);
  });
  await t.test('reactivation never restores cancelled rows; a fresh reminder is allowed',async()=>{
    await repo.updateCustomer(w.id,'customer1',actors.sales_agent,{customer_status:'New',tags:['Closed Lost'],city:'Reactivated city'});
    assert.equal((await repo.getLead(w.id,'lead1')).status,'New');
    assert.equal((await repo.getCustomer(w.id,'customer1')).city,'Reactivated city');
    assert.equal((await repo.getFollowUp(w.id,'f1Pending')).lifecycle_status,'Cancelled');
    await repo.createFollowUp(w.id,actors.sales_agent,{customer_id:'customer1',due_date:'2099-01-01',due_time:'10:00'});
    assert.equal((await sql.query('SELECT * FROM crm.follow_ups WHERE customer_id=$1',[fixtures[0].c.id])).length,3);
    await assert.rejects(sql.query("UPDATE crm.follow_ups SET status='Pending',metadata='{}' WHERE legacy_id='f1Pending'"),/Cancelled follow-up/);
  });
  await t.test('already claimed reminder is suppressed by worker after closure',async()=>{
    let sends=0;
    const pool={connect:async()=>({query:(text,params)=>db.query(text,params),release(){}})};
    const [item]=await sql.query("SELECT * FROM crm.outbox_events WHERE idempotency_key='outbox2'");
    assert.equal(await deliverOutboxItem(pool,item,async()=>{sends++;}),false); assert.equal(sends,0);
    const [active]=await sql.query("SELECT * FROM crm.outbox_events WHERE idempotency_key='outbox3'");
    assert.equal(await deliverOutboxItem(pool,active,async()=>{sends++;}),true); assert.equal(sends,1);
  });
  await t.test('legacy snapshot replay cannot reopen closed or reactivated opportunities or reminders',async()=>{
    const snapshot={
      users:[{id:'sales_agent',email:'sales_agent@example.test',full_name:'sales_agent',password_hash:'fixture-only',role:'sales_agent',team_id:'team',status:'active'}],
      teams:[{id:'team',name:'Test team'}],
      leads:[1,2].map(n=>({id:'lead'+n,full_name:'Stale person',status:'New',assigned_agent_id:'sales_agent',assigned_team_id:'team'})),
      customers:[1,2].map(n=>({id:'customer'+n,lead_id:'lead'+n,full_name:'Stale person',customer_status:'New',assigned_agent_id:'sales_agent',assigned_team_id:'team'})),
      followUps:[1,2].map(n=>({id:'f'+n+'Pending',lead_id:'lead'+n,customer_id:'customer'+n,status:'Pending',due_date:'2099-01-01',due_time:'10:00',assigned_agent_id:'sales_agent',assigned_team_id:'team'})),
      notifications:[['sales_agent',[{id:'stale-reminder',event_type:'follow_up_due',related_entity_type:'follow_up',related_entity_id:'f2Pending',message:'Stale reminder'}]]]
    };
    await syncCrmSnapshot(sql,snapshot,{workspaceLegacyId:'closure'});
    await syncCrmSnapshot(sql,snapshot,{workspaceLegacyId:'closure'});
    assert.equal((await repo.getLead(w.id,'lead1')).status,'New');
    assert.equal((await repo.getLead(w.id,'lead2')).status,'Closed Lost');
    assert.equal((await repo.getCustomer(w.id,'customer2')).customer_status,'Closed Lost');
    assert.equal((await repo.getFollowUp(w.id,'f1Pending')).lifecycle_status,'Cancelled');
    assert.equal((await repo.getFollowUp(w.id,'f2Pending')).lifecycle_status,'Cancelled');
    assert.equal((await repo.listNotifications(w.id,'sales_agent')).some(n=>n.message==='Stale reminder'),false);
    assert.equal((await repo.search(w.id,actors.sales_agent,'Searchable closure note')).customers[0].id,'customer1');
    assert.ok((await repo.search(w.id,actors.sales_agent,'Preserved history')).followUps.some(f=>f.id==='f2Pending'));
  });
});
