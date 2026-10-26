const { createDatabaseSql, resolveDatabaseDriver } = require('../backend/db/sql-client');
const { deliverOutboxItem } = require('../backend/outbox-delivery');

const connectionString = String(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();
const n8nUrl = String(process.env.N8N_WEBHOOK_URL || '').trim();
const n8nSecret = String(process.env.N8N_WEBHOOK_SECRET || '').trim();
const limit = Math.max(1, Math.min(Number(process.env.OUTBOX_BATCH_SIZE || 25), 100));

if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required.');
if (!n8nUrl) {
  console.log('No N8N_WEBHOOK_URL configured; outbox worker did not send anything.');
  process.exit(0);
}

const sql = createDatabaseSql(connectionString, { driver: resolveDatabaseDriver() });
const deliveryPool = sql.pool || null;

async function claimBatch() {
  return sql.query(`WITH candidates AS (
      SELECT id FROM crm.outbox_events
      WHERE status IN ('pending', 'failed') AND cancelled_at IS NULL AND next_attempt_at <= now()
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE crm.outbox_events event
    SET status = 'processing', attempt_count = event.attempt_count + 1
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.id, event.event_type, event.aggregate_type, event.aggregate_id, event.payload, event.idempotency_key, event.attempt_count`, [limit]);
}

async function markFailed(id, error) {
  await sql.query(`UPDATE crm.outbox_events SET status = 'failed', next_attempt_at = now() + interval '5 minutes', last_error = $2 WHERE id = $1`, [id, String(error).slice(0, 2000)]);
}

async function deliver(item) {
  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aureum-outbox-secret': n8nSecret },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      id: item.id,
      eventType: item.event_type,
      aggregateType: item.aggregate_type,
      aggregateId: item.aggregate_id,
      idempotencyKey: item.idempotency_key,
      payload: item.payload,
      attempt: item.attempt_count
    })
  });
  if (!response.ok) throw new Error(`n8n responded with HTTP ${response.status}`);
}

(async () => {
  const batch = await claimBatch();
  let delivered = 0;
  let failed = 0;
  for (const item of batch) {
    try {
      if (deliveryPool) {
        await deliverOutboxItem(deliveryPool, item, deliver);
      } else {
        await deliver(item);
        await sql.query(`UPDATE crm.outbox_events SET status = 'delivered', delivered_at = now(), last_error = NULL WHERE id = $1`, [item.id]);
      }
      delivered += 1;
    } catch (error) {
      await markFailed(item.id, error.message);
      failed += 1;
    }
  }
  console.log(JSON.stringify({ claimed: batch.length, delivered, failed }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.end?.());
