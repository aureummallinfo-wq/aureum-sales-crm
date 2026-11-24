const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('terminal follow-up repair migration converts legacy tag-only rows into closed tombstones', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const load = file => fs.readFileSync(path.join(__dirname, '../../../db/migrations', file), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await db.exec(load('002_production_crm_schema.sql'));
  await db.exec(load('012_opportunity_closure.sql'));
  await db.exec(load('014_edit_saved_notes.sql'));
  await db.exec(load('016_closed_won_followup_lifecycle.sql'));
  const query = async (text, params) => (await db.query(text, params)).rows;
  const [workspace] = await query("INSERT INTO crm.workspaces (name,legacy_id) VALUES ('Repair test','repair-test') RETURNING id");
  const [team] = await query("INSERT INTO crm.teams (workspace_id,legacy_id,name) VALUES ($1,'team','Team') RETURNING id", [workspace.id]);
  const [user] = await query("INSERT INTO crm.users (workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES ($1,'admin','admin@example.test','Admin','test','super_admin',$2) RETURNING id", [workspace.id, team.id]);
  for (const name of ['New', 'Closed Won', 'Closed Lost', 'Not Interested']) await query("INSERT INTO crm.lead_statuses (workspace_id,name,slug) VALUES ($1,$2,$3)", [workspace.id, name, name.toLowerCase().replaceAll(' ', '-')]);
  const [lead] = await query("INSERT INTO crm.leads (workspace_id,legacy_id,full_name,status_id,assigned_agent_id,assigned_team_id,metadata) VALUES ($1,'legacy-terminal','Legacy terminal', (SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND name='New'),$2,$3,'{\"tags\":[\"Closed Lost\",\"Follow-up\"]}'::jsonb) RETURNING id", [workspace.id, user.id, team.id]);
  const [customer] = await query("INSERT INTO crm.customers (workspace_id,legacy_id,lead_id,full_name,customer_status,assigned_agent_id,assigned_team_id,metadata) VALUES ($1,'legacy-customer',$2,'Legacy terminal','Active',$3,$4,'{\"tags\":[\"Closed Lost\",\"Follow-up\"]}'::jsonb) RETURNING id", [workspace.id, lead.id, user.id, team.id]);
  const [followup] = await query("INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,status) VALUES ($1,'legacy-followup',$2,$3,$4,$5,'Call',now()-interval '2 days','Overdue') RETURNING id", [workspace.id, lead.id, customer.id, user.id, team.id]);

  await db.exec(load('030_repair_terminal_followups.sql'));

  const leadRow = (await query("SELECT l.*, s.name AS status_name FROM crm.leads l JOIN crm.lead_statuses s ON s.id=l.status_id WHERE l.id=$1", [lead.id]))[0];
  const customerRow = (await query('SELECT * FROM crm.customers WHERE id=$1', [customer.id]))[0];
  const followupRow = (await query('SELECT * FROM crm.follow_ups WHERE id=$1', [followup.id]))[0];
  assert.equal(leadRow.status_name, 'Closed Lost');
  assert.equal(customerRow.customer_status, 'Closed Lost');
  assert.equal(leadRow.next_follow_up_at, null);
  assert.equal(followupRow.status, 'Cancelled');
  assert.equal(followupRow.cancelled_by_closure, true);
  assert.ok(Array.isArray(leadRow.metadata.tags));
  assert.ok(leadRow.metadata.tags.includes('Closed Lost'));
});

