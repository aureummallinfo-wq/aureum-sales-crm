const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');

test('legacy Not Interested opportunities remain in Customers and leave active Follow-ups', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ['002_production_crm_schema.sql', '003_workspace_settings.sql', '012_opportunity_closure.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations', file), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  }

  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repo = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Legacy cleanup test','legacy-cleanup') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams(workspace_id,legacy_id,name) VALUES($1,'team','Test team') RETURNING id", [workspace.id]);
  const [agent] = await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES($1,'agent','agent@example.test','Agent','fixture-only','sales_agent',$2) RETURNING id", [workspace.id, team.id]);
  const actor = { id: 'agent', role: 'sales_agent', team_id: 'team', full_name: 'Agent' };
  for (const name of ['New', 'Not Interested', 'Closed Lost']) await sql.query('INSERT INTO crm.lead_statuses(workspace_id,name,slug) VALUES($1,$2,$3)', [workspace.id, name, name.toLowerCase().replaceAll(' ', '-')]);
  await sql.query("INSERT INTO crm.notification_definitions(event_key,event_name) VALUES('follow_up_due','Due'),('follow_up_overdue','Overdue') ON CONFLICT DO NOTHING");

  const [lead] = await sql.query(`INSERT INTO crm.leads
    (workspace_id,legacy_id,full_name,email,assigned_agent_id,assigned_team_id,status_id,next_follow_up_at,metadata)
    VALUES($1,'legacy-lead','Legacy Not Interested','legacy@example.test',$2,$3,
      (SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND name='New'),
      now()+interval '1 day','{"tags":["Not Interested","Follow-up"]}'::jsonb) RETURNING id`, [workspace.id, agent.id, team.id]);
  const [customer] = await sql.query(`INSERT INTO crm.customers
    (workspace_id,legacy_id,lead_id,full_name,assigned_agent_id,assigned_team_id,customer_status,metadata)
    VALUES($1,'legacy-customer',$2,'Legacy Not Interested',$3,$4,'Active','{"tags":["Follow-up"]}'::jsonb) RETURNING id`, [workspace.id, lead.id, agent.id, team.id]);
  const [followUp] = await sql.query(`INSERT INTO crm.follow_ups
    (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status,notes)
    VALUES($1,'legacy-follow-up',$2,$3,$4,$5,'Call',now()+interval '1 day','Pending','Keep history') RETURNING id`, [workspace.id, lead.id, customer.id, agent.id, team.id]);
  await sql.query(`INSERT INTO crm.outbox_events(workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    VALUES($1,'follow_up_created','follow_up',$2,'{}','legacy-follow-up-outbox')`, [workspace.id, followUp.id]);
  await sql.query(`INSERT INTO crm.notifications(user_id,event_key,title,message,related_entity_type,related_entity_id,dedupe_key)
    VALUES($1,'follow_up_due','Due','Legacy reminder','follow_up',$2,'legacy-follow-up-notification')`, [agent.id, followUp.id]);
  await sql.query(`UPDATE crm.leads SET status_id=(SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND name='Not Interested'),metadata='{"tags":["Not Interested","Follow-up"]}'::jsonb WHERE id=$2`, [workspace.id, lead.id]);
  await sql.query(`UPDATE crm.customers SET customer_status='Not Interested',metadata='{"tags":["Not Interested","Follow-up"]}'::jsonb WHERE id=$1`, [customer.id]);

  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/013_reconcile_legacy_not_interested.sql'), 'utf8'));

  await t.test('canonicalizes the status and cancels only the closed opportunity reminder', async () => {
    assert.equal((await repo.getLead(workspace.id, 'legacy-lead')).status, 'Closed Lost');
    const savedCustomer = await repo.getCustomer(workspace.id, 'legacy-customer');
    assert.equal(savedCustomer.customer_status, 'Closed Lost');
    assert.equal(savedCustomer.next_follow_up_at, null);
    assert.equal((await repo.listCustomers({ workspaceId: workspace.id, user: actor, status: 'Closed Lost' })).length, 1);
    assert.equal((await repo.listFollowUps({ workspaceId: workspace.id, user: actor })).length, 0);
    assert.equal((await repo.listCustomerFollowUpHistory(workspace.id, 'legacy-customer', actor)).length, 1);

    const [cancelled] = await sql.query('SELECT status,cancelled_by_closure FROM crm.follow_ups WHERE id=$1', [followUp.id]);
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(cancelled.cancelled_by_closure, true);
    const [outbox] = await sql.query("SELECT cancelled_at FROM crm.outbox_events WHERE idempotency_key='legacy-follow-up-outbox'");
    assert.ok(outbox.cancelled_at);
    const [notification] = await sql.query("SELECT is_read FROM crm.notifications WHERE dedupe_key='legacy-follow-up-notification'");
    assert.equal(notification.is_read, true);
  });

  await t.test('re-running reconciliation is idempotent and preserves the history count', async () => {
    const before = await sql.query("SELECT count(*)::integer AS count FROM crm.audit_events WHERE action='legacy_opportunity_reconciled'");
    await sql.query('SELECT crm.reconcile_legacy_closed_opportunities()');
    const after = await sql.query("SELECT count(*)::integer AS count FROM crm.audit_events WHERE action='legacy_opportunity_reconciled'");
    assert.equal(after[0].count, before[0].count);
    assert.equal((await repo.listCustomerFollowUpHistory(workspace.id, 'legacy-customer', actor)).length, 1);
  });
});
