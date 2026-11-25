const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');

const migration = file => fs.readFileSync(path.join(__dirname, '../../../db/migrations', file), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');

test('Meta leads can be reviewed in staging and promoted idempotently into the CRM', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ['002_production_crm_schema.sql', '003_workspace_settings.sql', '004_crm_integration_metadata.sql', '012_opportunity_closure.sql', '014_edit_saved_notes.sql', '015_meta_crm_feedback.sql', '023_lead_received_at.sql', '027_meta_lead_staging.sql', '028_meta_lead_attribution.sql', '029_meta_lead_final_fields.sql']) await db.exec(migration(file));
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repo = createNeonRepository(sql);
  const [workspace] = await sql.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Meta staging test','meta-staging') RETURNING id");
  await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key) VALUES($1,'admin','admin@example.test','Admin','fixture-only','super_admin')", [workspace.id]);
  const actor = { id: 'admin', role: 'super_admin', full_name: 'Admin' };

  const first = await repo.createMetaLeadStaging(workspace.id, {
    external_lead_id: 'meta-987654321',
    idempotency_key: 'meta-987654321',
    form_id: 'form-123',
    form_name: 'Aureum Mall Lahore',
    platform: 'fb',
    full_name: 'Staging Buyer',
    phone: '+92 300 1234567',
    email: 'buyer@example.test',
    city: 'Lahore',
    interested_in: '2 Bed Apartment',
    created_time: '2026-11-23T10:00:00+05:00'
  });
  assert.equal(first.review_status, 'Pending review');
  assert.equal(first.feedback_status, 'Not queued');
  assert.equal(first.external_lead_id, 'meta-987654321');
  assert.equal(first.source_channel, 'meta_lead_ads');
  assert.equal(first.ingested_via, 'zapier');

  const pending = await repo.listMetaLeadStaging(workspace.id, { status: 'Pending review' });
  assert.equal(pending.length, 1);
  const bySource = await repo.listMetaLeadStaging(workspace.id, { source: 'meta_lead_ads' });
  assert.equal(bySource.length, 1);
  const bySearch = await repo.listMetaLeadStaging(workspace.id, { search: 'Staging Buyer' });
  assert.equal(bySearch.length, 1);
  const byInterest = await repo.listMetaLeadStaging(workspace.id, { interest: '2 Bed' });
  assert.equal(byInterest.length, 1);
  const byDate = await repo.listMetaLeadStaging(workspace.id, { dateFrom: '2026-11-23', dateTo: '2026-11-23' });
  assert.equal(byDate.length, 1);

  const retry = await repo.createMetaLeadStaging(workspace.id, { external_lead_id: 'meta-987654321', idempotency_key: 'meta-987654321', full_name: 'Staging Buyer Updated' });
  assert.equal(retry.id, first.id);
  assert.equal(retry.review_status, 'Pending review');

  const reviewed = await repo.updateMetaLeadStaging(workspace.id, first.id, actor, { review_status: 'Reviewed', outcome: 'Qualified', review_notes: 'Verified by sales manager', feedback_status: 'Ready for Meta' });
  assert.equal(reviewed.review_status, 'Reviewed');
  assert.equal(reviewed.outcome, 'Qualified');

  const promoted = await repo.promoteMetaLeadStaging(workspace.id, first.id, actor);
  assert.equal(promoted.review_status, 'Sent to CRM');
  assert.ok(promoted.crm_lead_id);
  const [lead] = await sql.query('SELECT l.external_source,l.external_lead_id,l.full_name,s.name AS status FROM crm.leads l LEFT JOIN crm.lead_statuses s ON s.id=l.status_id WHERE l.id=$1', [promoted.crm_lead_id]);
  assert.deepEqual(lead, { external_source: 'meta', external_lead_id: 'meta-987654321', full_name: 'Staging Buyer', status: 'Qualified' });

  const secondPromotion = await repo.promoteMetaLeadStaging(workspace.id, first.id, actor);
  assert.equal(secondPromotion.crm_lead_id, promoted.crm_lead_id);
  assert.equal((await sql.query("SELECT count(*)::int AS n FROM crm.leads WHERE external_lead_id='meta-987654321'"))[0].n, 1);
});
