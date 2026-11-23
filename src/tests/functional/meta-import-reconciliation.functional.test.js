const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');

const migration = file => fs.readFileSync(path.join(__dirname, '../../../db/migrations', file), 'utf8')
  .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');

test('Meta reconciliation accepts missing lead IDs and keeps imported leads in the manager queue', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ['002_production_crm_schema.sql', '003_workspace_settings.sql', '004_crm_integration_metadata.sql', '012_opportunity_closure.sql', '014_edit_saved_notes.sql', '015_meta_crm_feedback.sql', '023_lead_received_at.sql', '027_meta_lead_staging.sql']) await db.exec(migration(file));
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repository = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Import reconciliation','reconcile') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams(workspace_id,legacy_id,name) VALUES($1,'team','Sales Team') RETURNING id", [workspace.id]);
  await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES($1,'manager','manager@example.test','Manager','fixture','sales_manager',$2),($1,'agent','agent@example.test','Agent','fixture','sales_agent',$2)", [workspace.id, team.id]);
  await sql.query("INSERT INTO crm.lead_statuses(workspace_id,name,slug) VALUES($1,'New','new')", [workspace.id]);
  await sql.query("INSERT INTO crm.lead_sources(workspace_id,name,slug,is_default) VALUES($1,'Manual Entry','manual-entry',true)", [workspace.id]);
  const manager = { id: 'manager', role: 'sales_manager', team_id: 'team', full_name: 'Manager' };

  const noIdLead = await repository.createLead({ workspaceId: workspace.id, actor: manager, lead: {
    full_name: 'No ID Buyer', phone: '+923001234567', email: 'noid@example.test', interested_in: 'Commercial',
    status: 'New', lead_source: 'Instagram', assigned_team_id: 'team', is_imported: true, imported_from: 'CSV', created_time: '2026-11-21 06:14:21'
  } });
  assert.equal(noIdLead.external_lead_id, null);
  assert.equal(noIdLead.lead_source, 'Instagram');
  assert.equal(noIdLead.assigned_agent_id, null);
  assert.equal(new Date(noIdLead.received_at).toISOString(), '2026-11-21T01:14:21.000Z');
  assert.equal((await repository.findLeadDuplicate(workspace.id, { phone: '923001234567', email: 'noid@example.test' })).id, noIdLead.id);
  assert.deepEqual((await repository.listLeads({ workspaceId: workspace.id, user: manager, dateFrom: '2026-11-21', dateTo: '2026-11-21' })).map(item => item.full_name), ['No ID Buyer']);

  const withIdLead = await repository.createLead({ workspaceId: workspace.id, actor: manager, lead: {
    full_name: 'Meta ID Buyer', phone: '+923001234568', interested_in: 'Commercial', status: 'New', lead_source: 'Facebook',
    assigned_team_id: 'team', external_source: 'meta', external_lead_id: 'l:123456789', idempotency_key: 'l:123456789'
  } });
  assert.equal((await repository.findLeadDuplicate(workspace.id, { externalLeadId: 'l:123456789' })).id, withIdLead.id);

  await repository.createLead({ workspaceId: workspace.id, actor: manager, lead: {
    full_name: 'Assigned Buyer', phone: '+923001234569', interested_in: 'Commercial', status: 'New', lead_source: 'Facebook',
    assigned_agent_id: 'agent', assigned_team_id: 'team'
  } });
  const queue = await repository.listLeads({ workspaceId: workspace.id, user: manager, assignment: 'unassigned' });
  assert.deepEqual(queue.map(item => item.full_name).sort(), ['Meta ID Buyer', 'No ID Buyer']);
});

