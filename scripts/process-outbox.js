const { createDatabaseSql, resolveDatabaseDriver } = require('../backend/db/sql-client');
const { processOutboxBatch } = require('../backend/outbox-delivery');

const connectionString = String(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();
const n8nUrl = String(process.env.N8N_WEBHOOK_URL || '').trim();
const n8nSecret = String(process.env.N8N_WEBHOOK_SECRET || '').trim();
const limit = Math.max(1, Math.min(Number(process.env.OUTBOX_BATCH_SIZE || 25), 100));
const maxAttempts = Math.max(1, Math.min(Number(process.env.OUTBOX_MAX_ATTEMPTS || 10), 50));

if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required.');
if (!n8nUrl) {
  console.log('No N8N_WEBHOOK_URL configured; outbox worker did not send anything.');
  process.exit(0);
}

const sql = createDatabaseSql(connectionString, { driver: resolveDatabaseDriver() });

async function send(message) {
  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aureum-outbox-secret': n8nSecret },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(message)
  });
  if (!response.ok) throw new Error(`n8n responded with HTTP ${response.status}`);
}

processOutboxBatch({ sql, pool: sql.pool || null, send, limit, maxAttempts })
  .then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => sql.end?.());
