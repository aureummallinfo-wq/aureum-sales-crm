const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '../../..');
const clientPath = require.resolve(path.join(root, 'backend/db/sql-client'));
const gatePath = path.join(root, 'scripts/apply-schema-migrations.js');

// Runs the gate script against PGlite by standing in for the pg pool it opens.
function gateRunner(db) {
  const query = (text, params) => (params && params.length ? db.query(text, params) : db.exec(text).then(results => results[results.length - 1] || { rows: [] }));
  return async (...args) => {
    let finished;
    const ended = new Promise(resolve => { finished = resolve; });
    require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { createPostgresSql: () => ({ pool: { connect: async () => ({ query, release() {} }), end: async () => finished() } }) } };
    delete require.cache[gatePath];
    const previous = { argv: process.argv, url: process.env.DATABASE_URL, log: console.log, error: console.error };
    const output = [];
    process.argv = ['node', gatePath, ...args];
    process.env.DATABASE_URL = 'postgres://fixture@localhost/crm';
    process.exitCode = 0;
    console.log = line => output.push(line); console.error = line => output.push(line);
    try {
      require(gatePath);
      await ended;
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      Object.assign(console, { log: previous.log, error: previous.error });
      process.argv = previous.argv;
      if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    }
    const exit = process.exitCode || 0;
    process.exitCode = 0;
    let body = null;
    try { body = JSON.parse(output[output.length - 1]); } catch { body = output.join('\n'); }
    return { exit, body };
  };
}

test('schema gate applies only unrecorded migrations and never rewrites lead timestamps', async t => {
  const db = new PGlite(); t.after(() => db.close());
  const load = file => db.exec(fs.readFileSync(path.join(root, 'db/migrations', file), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  for (const file of ['002_production_crm_schema.sql', '003_workspace_settings.sql', '004_crm_integration_metadata.sql', '010_request_rate_limits.sql', '012_opportunity_closure.sql']) await load(file);
  const [w] = (await db.query("INSERT INTO crm.workspaces(name,legacy_id) VALUES('Gate test','gate') RETURNING id")).rows;
  for (const name of ['New', 'Closed Lost', 'Not Interested']) await db.query('INSERT INTO crm.lead_statuses(workspace_id,name,slug) VALUES($1,$2,$3)', [w.id, name, name.toLowerCase().replace(' ', '-')]);
  await load('013_reconcile_legacy_not_interested.sql');
  await db.query("INSERT INTO crm.leads(workspace_id,legacy_id,full_name,metadata,updated_at) VALUES($1,'lead_a','Fixture','{\"external_lead_id\":\"2345678901234567\"}','2026-01-01T00:00:00Z')", [w.id]);
  const gate = gateRunner(db);

  await t.test('status reports the objects a database without 014 is missing', async () => {
    const { exit, body } = await gate('--status');
    assert.equal(exit, 4);
    assert.ok(body.missingObjects.includes('column crm.lead_notes.edited_by (from 014_edit_saved_notes.sql)'));
    assert.ok(body.missingObjects.includes('column crm.customer_notes.edited_by (from 014_edit_saved_notes.sql)'));
    assert.equal(body.counts.leads, 1);
  });

  await t.test('apply refuses to run before a baseline is recorded', async () => {
    assert.equal((await gate('--apply')).exit, 4);
    assert.equal((await db.query('SELECT to_regclass($1) AS t', ['crm.note_revisions'])).rows[0].t, null);
  });

  await t.test('baseline refuses to bless a database missing an earlier required object', async () => {
    await db.exec('DROP TABLE crm.request_rate_limits');
    const result = await gate('--baseline-through=013');
    assert.equal(result.exit, 1);
    assert.match(result.body, /Cannot baseline through 013/);
    await load('010_request_rate_limits.sql');
  });

  await t.test('after a baseline only the requested pending files run', async () => {
    assert.equal((await gate('--baseline-through=013')).body.baselined.length, 13);
    const step = await gate('--apply', '--through=014');
    assert.deepEqual(step.body.applied, ['014_edit_saved_notes.sql']);
    assert.deepEqual(step.body.countsAfter, step.body.countsBefore);
    assert.equal((await gate('--require-current')).exit, 1);
    assert.deepEqual((await gate('--apply')).body.applied, ['015_meta_crm_feedback.sql']);
    assert.equal((await gate('--require-current')).exit, 0);
    assert.deepEqual((await gate('--apply')).body.applied, []);
  });

  await t.test('the 015 backfill keeps updated_at and re-enables lead triggers', async () => {
    const [lead] = (await db.query("SELECT external_lead_id, updated_at FROM crm.leads WHERE legacy_id='lead_a'")).rows;
    assert.equal(lead.external_lead_id, '2345678901234567');
    assert.equal(lead.updated_at.toISOString(), '2026-01-01T00:00:00.000Z');
    const disabled = (await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid='crm.leads'::regclass AND NOT tgisinternal AND tgenabled='D'")).rows;
    assert.deepEqual(disabled, []);
  });
});
