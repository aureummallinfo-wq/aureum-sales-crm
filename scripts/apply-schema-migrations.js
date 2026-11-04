// Schema-only release gate for the VPS PostgreSQL database.
//
// Unlike migrate-database.js this never imports the legacy aureum_crm_state
// snapshot, and it runs each migration file at most once: applied files are
// recorded in crm.schema_migrations. Several older files rewrite data (team
// consolidation, status renames, reconciliation), so re-running them on every
// release would keep changing live records.
//
//   --status                 list applied/pending files and check required objects (default)
//   --baseline-through=NNN   one-time: record files up to NNN as already applied, without running them
//   --apply [--through=NNN]  apply pending files in order, each in its own transaction
//   --require-current        exit 1 unless nothing is pending and every required object exists
//
// Output is limited to file names, schema checks and aggregate row counts.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createPostgresSql } = require('../backend/db/sql-client');

const EXIT_PENDING = 3;
const EXIT_NO_BASELINE = 4;
const migrationsDir = path.resolve(__dirname, '..', 'db', 'migrations');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=')[1] || '';

// Objects the deployed code queries directly, with the file that creates them.
const REQUIRED_OBJECTS = [
  ['010_request_rate_limits.sql', 'table', 'crm.request_rate_limits'],
  ['012_opportunity_closure.sql', 'column', 'leads', 'lifecycle_version'],
  ['012_opportunity_closure.sql', 'column', 'follow_ups', 'cancelled_by_closure'],
  ['012_opportunity_closure.sql', 'column', 'outbox_events', 'cancelled_at'],
  ['012_opportunity_closure.sql', 'function', 'crm.transition_opportunity(uuid,uuid,uuid,text,text,jsonb,text)'],
  ['013_reconcile_legacy_not_interested.sql', 'function', 'crm.reconcile_legacy_closed_opportunities()'],
  ['014_edit_saved_notes.sql', 'column', 'lead_notes', 'version'],
  ['014_edit_saved_notes.sql', 'column', 'lead_notes', 'edited_by'],
  ['014_edit_saved_notes.sql', 'column', 'customer_notes', 'version'],
  ['014_edit_saved_notes.sql', 'column', 'customer_notes', 'edited_by'],
  ['014_edit_saved_notes.sql', 'table', 'crm.note_revisions'],
  ['014_edit_saved_notes.sql', 'function', 'crm.edit_saved_note(uuid,text,uuid,uuid,uuid,integer,text)'],
  ['015_meta_crm_feedback.sql', 'column', 'outbox_events', 'claimed_at']
];
const COUNTED_TABLES = ['leads', 'customers', 'lead_notes', 'customer_notes', 'lead_activities', 'customer_activities', 'follow_ups'];

function migrationFiles() {
  return fs.readdirSync(migrationsDir).filter(name => /^\d{3}_[\w-]+\.sql$/.test(name)).sort();
}

function connectionString() {
  const value = String(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();
  if (!value) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required.');
  let host = '';
  try { host = new URL(value).hostname.toLowerCase(); } catch { throw new Error('The database connection string is malformed.'); }
  if (host === 'neon.tech' || host.endsWith('.neon.tech')) throw new Error('This gate is for the VPS PostgreSQL database; refusing to run against Neon.');
  return value;
}

async function ensureLedger(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS crm');
  await client.query(`CREATE TABLE IF NOT EXISTS crm.schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    baseline boolean NOT NULL DEFAULT false,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

function checksum(name) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationsDir, name))).digest('hex');
}

async function ledger(client) {
  const { rows } = await client.query('SELECT name FROM crm.schema_migrations');
  return new Set(rows.map(row => row.name));
}

async function checkObjects(client, through = '') {
  const missing = [];
  for (const [source, kind, name, column] of REQUIRED_OBJECTS) {
    if (through && source.slice(0, 3) > through) continue;
    let present;
    if (kind === 'column') present = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='crm' AND table_name=$1 AND column_name=$2", [name, column])).rows.length > 0;
    else if (kind === 'table') present = (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [name])).rows[0].present;
    else present = (await client.query('SELECT to_regprocedure($1) IS NOT NULL AS present', [name])).rows[0].present;
    if (!present) missing.push(`${kind} ${column ? `crm.${name}.${column}` : name} (from ${source})`);
  }
  return missing;
}

async function counts(client) {
  const result = {};
  for (const table of COUNTED_TABLES) {
    const exists = (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [`crm.${table}`])).rows[0].present;
    if (!exists) { result[table] = null; continue; }
    const hasDeletedAt = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='crm' AND table_name=$1 AND column_name='deleted_at'", [table])).rows.length > 0;
    result[table] = Number((await client.query(`SELECT count(*) AS n FROM crm.${table}${hasDeletedAt ? ' WHERE deleted_at IS NULL' : ''}`)).rows[0].n);
  }
  return result;
}

async function status(client) {
  const applied = await ledger(client);
  const files = migrationFiles();
  return { baselined: applied.size > 0, applied: files.filter(name => applied.has(name)), pending: files.filter(name => !applied.has(name)), missingObjects: await checkObjects(client) };
}

async function baseline(client, through) {
  if (!/^\d{3}$/.test(through)) throw new Error('--baseline-through needs a three-digit migration number, for example 013.');
  if ((await ledger(client)).size) throw new Error('crm.schema_migrations already has entries; a baseline can only be recorded once.');
  const files = migrationFiles().filter(name => name.slice(0, 3) <= through);
  if (!files.length || files[files.length - 1].slice(0, 3) !== through) throw new Error(`No migration file exists for baseline ${through}.`);
  const missing = await checkObjects(client, through);
  if (missing.length) throw new Error(`Cannot baseline through ${through}; required objects are missing: ${missing.join('; ')}`);
  await client.query('BEGIN');
  for (const name of files) await client.query('INSERT INTO crm.schema_migrations (name, checksum, baseline) VALUES ($1, $2, true)', [name, checksum(name)]);
  await client.query('COMMIT');
  return files;
}

async function apply(client, through) {
  const before = await status(client);
  if (!before.baselined) return { error: 'No baseline recorded. On an existing database run --baseline-through=NNN once with the last migration already applied.', exit: EXIT_NO_BASELINE };
  const files = before.pending.filter(name => !through || name.slice(0, 3) <= through);
  const countsBefore = await counts(client);
  const applied = [];
  for (const name of files) {
    await client.query('BEGIN');
    try {
      await client.query(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
      await client.query('INSERT INTO crm.schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum(name)]);
      await client.query('COMMIT');
      applied.push(name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${name} failed and was rolled back (SQLSTATE ${error.code || 'unknown'}). Applied before it: ${applied.join(', ') || 'none'}.`);
    }
  }
  return { applied, countsBefore, countsAfter: await counts(client) };
}

(async () => {
  const pool = createPostgresSql(connectionString()).pool;
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('aureum_schema_migrations'))");
    await ensureLedger(client);
    if (option('baseline-through')) {
      console.log(JSON.stringify({ baselined: await baseline(client, option('baseline-through')) }));
      return;
    }
    if (flag('apply')) {
      const result = await apply(client, option('through'));
      console.log(JSON.stringify(result));
      if (result.exit) process.exitCode = result.exit;
      return;
    }
    const current = await status(client);
    console.log(JSON.stringify({ ...current, counts: await counts(client) }));
    if (flag('require-current')) process.exitCode = current.pending.length || current.missingObjects.length ? 1 : 0;
    else if (!current.baselined) process.exitCode = EXIT_NO_BASELINE;
    else if (current.pending.length) process.exitCode = EXIT_PENDING;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('aureum_schema_migrations'))").catch(() => {});
    client.release();
    await pool.end();
  }
})().catch(error => { console.error(`schema gate: ${error.message}`); process.exitCode = 1; });
