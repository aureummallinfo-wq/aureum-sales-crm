const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const runtime = fs.readFileSync(path.join(ROOT, 'frontend/meta-intake-runtime.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'frontend/app-shell.js'), 'utf8');
const entry = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'backend/crm-api-server.js'), 'utf8');
const repository = fs.readFileSync(path.join(ROOT, 'backend/db/neon-repository.js'), 'utf8');
const relationalApi = fs.readFileSync(path.join(ROOT, 'backend/db/relational-api.js'), 'utf8');
const listMigration = fs.readFileSync(path.join(ROOT, 'db/migrations/032_meta_staging_list_performance.sql'), 'utf8');
const versionMigration = fs.readFileSync(path.join(ROOT, 'db/migrations/033_meta_staging_version_check.sql'), 'utf8');

test('Meta Intake bypasses the general API cache and retries transient empty startup results', () => {
  assert.match(runtime, /apiFetch\(`\/api\/meta\/staging\?\$\{query\.toString\(\)\}`, \{ cacheTtl: 0/);
  assert.match(runtime, /const retryDelays = \[500, 1000, 2000\]/);
  assert.doesNotMatch(runtime, /state\.metaInbox\.loading\) return;/);
});

test('latest Meta Intake request wins and stale results cannot repaint the screen', () => {
  assert.match(runtime, /const requestToken = \(state\.metaInbox\.requestToken \|\| 0\) \+ 1/);
  assert.match(runtime, /requestToken !== state\.metaInbox\.requestToken/);
  assert.match(runtime, /requestSignature !== currentMetaRequestSignature\(\)/);
  assert.match(shell, /requestToken: 0, lastLoadedAt: 0, lastCheckedAt: 0, version: ''/);
});

test('Meta Intake revalidates automatically when visible and while left open', () => {
  assert.match(runtime, /addEventListener\('focus', revalidateMetaIntake\)/);
  assert.match(runtime, /addEventListener\('visibilitychange', revalidateMetaIntake\)/);
  assert.match(runtime, /setInterval\(revalidateMetaIntake, 15000\)/);
  assert.match(runtime, /apiFetch\(`\/api\/meta\/staging\/version\?\$\{query\.toString\(\)\}`/);
  assert.match(runtime, /version !== state\.metaInbox\.version\) await loadMetaIntake\(true, 3, \{ silent: true \}\)/);
  assert.match(runtime, /requestSignature !== currentMetaRequestSignature\(\)/);
});

test('browser receives the final refresh runtime instead of a cached older script', () => {
  assert.match(entry, /meta-intake-runtime\.js\?v=20261126-meta-intake-refresh-final/);
});

test('server and database layers keep the Meta Intake response fresh and fast', () => {
  assert.match(server, /'Cache-Control': 'no-store'/);
  assert.match(relationalApi, /pathname === '\/api\/meta\/staging\/version'/);
  assert.match(repository, /async function getMetaLeadStagingVersion/);
  assert.match(repository, /count\(\*\)::int AS total, max\(m\.updated_at\) AS latest_updated_at/);
  assert.match(listMigration, /workspace_id, submitted_at DESC NULLS LAST, created_at DESC/);
  assert.match(versionMigration, /workspace_id, updated_at DESC/);
});
