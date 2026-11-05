const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { processOutboxBatch } = require('../../../backend/outbox-delivery');

const migration = file => fs.readFileSync(path.join(__dirname, '../../../db/migrations', file), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');

test('Meta lead IDs survive intake and reach n8n with status changes, without free text', async t => {
  const db = new PGlite(); t.after(() => db.close());
  for (const file of ['002_production_crm_schema.sql', '003_workspace_settings.sql', '004_crm_integration_metadata.sql', '012_opportunity_closure.sql', '014_edit_saved_notes.sql', '015_meta_crm_feedback.sql']) await db.exec(migration(file));
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  const repo = createNeonRepository(sql);
  const [w] = await sql.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Meta feedback test','meta') RETURNING id");
  const [team] = await sql.query("INSERT INTO crm.teams(workspace_id,legacy_id,name) VALUES($1,'team','Test team') RETURNING id", [w.id]);
  await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES($1,'super_admin','admin@example.test','Admin','fixture-only','super_admin',$2)", [w.id, team.id]);
  const admin = { id: 'super_admin', role: 'super_admin', team_id: 'team', full_name: 'Admin' };
  for (const name of ['New', 'Qualified', 'Closed Lost', 'Not Interested']) await sql.query('INSERT INTO crm.lead_statuses(workspace_id,name,slug) VALUES($1,$2,$3)', [w.id, name, name.toLowerCase().replaceAll(' ', '-')]);
  await sql.query("INSERT INTO crm.lead_sources(workspace_id,name,slug) VALUES($1,'Facebook','facebook')", [w.id]);
  const secret = 'fixture-webhook-secret';
  await sql.query("INSERT INTO crm.webhook_connections(workspace_id,legacy_id,name,source_platform,secret_hash,status,default_lead_source,default_lead_status) VALUES($1,'meta_hook','Meta intake','meta',$2,'active','Facebook','New')", [w.id, crypto.createHash('sha256').update(secret).digest('hex')]);
  const metaLeadId = '23456789012345678';
  const intake = extra => repo.ingestWebhookLead(w.id, 'meta_hook', secret, { full_name: 'Test Buyer', phone: '0300-1112223', form_id: '1442011523968873', form_name: 'Higher Intent Form', source_page: '1192744627246593', ...extra });
  const sent = [];
  const run = (send = async message => { sent.push(message); }, options = {}) => processOutboxBatch({ sql, send, ...options });

  await t.test('intake stores the Meta lead ID in its column and queues lead_created', async () => {
    const result = await intake({ external_lead_id: metaLeadId, idempotency_key: 'first' });
    assert.equal(result.duplicate, false);
    const [row] = await sql.query('SELECT external_source, external_lead_id FROM crm.leads WHERE legacy_id=$1', [result.lead.id]);
    assert.deepEqual(row, { external_source: 'meta', external_lead_id: metaLeadId });
    assert.equal((await sql.query("SELECT count(*)::int AS n FROM crm.outbox_events WHERE event_type='lead_created'"))[0].n, 1);
  });

  await t.test('a retry with a new idempotency key matches the same Meta lead ID', async () => {
    const result = await intake({ external_lead_id: metaLeadId, idempotency_key: 'second' });
    assert.equal(result.duplicate, true);
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM crm.leads WHERE external_lead_id=$1', [metaLeadId]))[0].n, 1);
  });

  await t.test('webhook intake repairs a missing source catalog row', async () => {
    const autoSecret = 'auto-source-fixture-secret';
    await sql.query("INSERT INTO crm.webhook_connections(workspace_id,legacy_id,name,source_platform,secret_hash,status,default_lead_source,default_lead_status) VALUES($1,'auto_hook','Auto source intake','meta',$2,'active','Meta Lead Ads','New')", [w.id, crypto.createHash('sha256').update(autoSecret).digest('hex')]);
    const result = await repo.ingestWebhookLead(w.id, 'auto_hook', autoSecret, { full_name: 'Auto Source Buyer', phone: '0300-1112233', external_lead_id: 'auto-source-001' });
    assert.equal(result.ok, true);
    const [source] = await sql.query("SELECT name,is_active FROM crm.lead_sources WHERE workspace_id=$1 AND slug='meta-lead-ads'", [w.id]);
    assert.deepEqual(source, { name: 'Meta Lead Ads', is_active: true });
  });

  await t.test('an ID that arrived as an unsafe JSON number is not stored as the match key', async () => {
    const result = await intake({ external_lead_id: 23456789012345680, phone: '0300-9998887' });
    const [row] = await sql.query('SELECT external_lead_id, metadata FROM crm.leads WHERE legacy_id=$1', [result.lead.id]);
    assert.equal(row.external_lead_id, null);
    assert.equal(row.metadata.external_lead_id_unsafe, '23456789012345680');
  });

  await t.test('n8n receives the lead identity and event time but never the closure reason', async () => {
    const [lead] = await sql.query('SELECT legacy_id FROM crm.leads WHERE external_lead_id=$1', [metaLeadId]);
    await repo.changeLeadStatus(w.id, lead.legacy_id, admin, 'Qualified');
    await repo.updateLead(w.id, lead.legacy_id, admin, { status: 'Not Interested', closure_reason: 'Wants a lower price, discussing with family' });
    const result = await run();
    assert.equal(result.delivered, result.claimed); assert.equal(result.failed + result.dead, 0);
    const changes = sent.filter(message => message.eventType === 'lead_status_changed');
    assert.deepEqual(changes.map(message => message.payload.status), ['Qualified', 'Closed Lost']);
    for (const message of changes) {
      assert.equal(message.lead.externalLeadId, metaLeadId);
      assert.equal(message.lead.externalSource, 'meta');
      assert.equal(message.lead.formId, '1442011523968873');
      assert.equal(message.lead.pageId, '1192744627246593');
      assert.match(message.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
    }
    assert.equal(JSON.stringify(sent).includes('lower price'), false);
    assert.equal((await sql.query("SELECT count(*)::int AS n FROM crm.outbox_events WHERE status<>'delivered'"))[0].n, 0);
  });

  await t.test('failures back off exponentially and park as dead after the last attempt', async () => {
    await sql.query("INSERT INTO crm.outbox_events(workspace_id,event_type,aggregate_type,payload,idempotency_key) VALUES($1,'probe','probe','{}','probe')", [w.id]);
    const failing = async () => { throw new Error('n8n responded with HTTP 503'); };
    assert.deepEqual(await run(failing, { maxAttempts: 3 }), { claimed: 1, delivered: 0, failed: 1, dead: 0 });
    const [first] = await sql.query("SELECT status, extract(epoch FROM next_attempt_at-now())::int AS wait FROM crm.outbox_events WHERE idempotency_key='probe'");
    assert.equal(first.status, 'failed'); assert.ok(first.wait > 50 && first.wait <= 60);
    await sql.query("UPDATE crm.outbox_events SET next_attempt_at=now() WHERE idempotency_key='probe'");
    await run(failing, { maxAttempts: 3 });
    const [second] = await sql.query("SELECT extract(epoch FROM next_attempt_at-now())::int AS wait FROM crm.outbox_events WHERE idempotency_key='probe'");
    assert.ok(second.wait > 110 && second.wait <= 120);
    await sql.query("UPDATE crm.outbox_events SET next_attempt_at=now() WHERE idempotency_key='probe'");
    assert.deepEqual(await run(failing, { maxAttempts: 3 }), { claimed: 1, delivered: 0, failed: 0, dead: 1 });
    assert.equal((await run(failing, { maxAttempts: 3 })).claimed, 0);
  });

  await t.test('a claim abandoned by a crashed worker is picked up again', async () => {
    await sql.query("INSERT INTO crm.outbox_events(workspace_id,event_type,aggregate_type,payload,idempotency_key,status,claimed_at) VALUES($1,'probe','probe','{}','stuck','processing',now()-interval '1 hour'),($1,'probe','probe','{}','busy','processing',now())", [w.id]);
    sent.length = 0;
    assert.equal((await run()).claimed, 1);
    assert.equal(sent[0].idempotencyKey, 'stuck');
  });
});
