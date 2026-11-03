// Hold the same opportunity lock used by closure until the external send ends.
// This serializes closure with delivery, including workers that already claimed
// a batch. A send already in progress finishes before closure can commit.
async function deliverOutboxItem(pool, item, send) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (item.aggregate_type === 'follow_up') {
      await client.query(`SELECT l.id FROM crm.leads l WHERE l.id=(
        SELECT coalesce(f.lead_id,c.lead_id) FROM crm.follow_ups f
        LEFT JOIN crm.customers c ON c.id=f.customer_id WHERE f.id=$1) FOR UPDATE`,[item.aggregate_id]);
    }
    const result = await client.query(`SELECT e.id FROM crm.outbox_events e WHERE e.id=$1 AND e.cancelled_at IS NULL
      AND (e.aggregate_type <> 'follow_up' OR EXISTS (
        SELECT 1 FROM crm.follow_ups f LEFT JOIN crm.customers c ON c.id=f.customer_id
        JOIN crm.leads l ON l.id=coalesce(f.lead_id,c.lead_id)
        LEFT JOIN crm.lead_statuses s ON s.id=l.status_id
        WHERE f.id=e.aggregate_id AND f.deleted_at IS NULL AND NOT f.cancelled_by_closure
          AND f.status NOT IN ('Cancelled') AND coalesce(s.name,'') NOT IN ('Closed Lost','Not Interested')))
      FOR UPDATE OF e`,[item.id]);
    if (result.rows.length) await send(item);
    await client.query(`UPDATE crm.outbox_events SET status='delivered',delivered_at=now(),last_error=NULL WHERE id=$1`,[item.id]);
    await client.query('COMMIT');
    return result.rows.length > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Salesperson free text (closure reasons, notes) stays in the CRM; n8n only
// receives structured fields it can map to Meta conversion events.
const FREE_TEXT_KEYS = new Set(['reason', 'closure_reason', 'note', 'notes', 'message', 'description', 'body']);
const CLAIM_TIMEOUT_MINUTES = 15;
const MAX_BACKOFF_MINUTES = 360;

function publicPayload(payload) {
  return Object.fromEntries(Object.entries(payload || {}).filter(([key]) => !FREE_TEXT_KEYS.has(key)));
}

function isoTime(value) { return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null; }

// occurredAt is when the CRM change committed, not when delivery happened, so
// retries report the original event time to Meta.
function buildOutboxMessage(item, lead) {
  return {
    id: item.id,
    eventType: item.event_type,
    aggregateType: item.aggregate_type,
    aggregateId: item.aggregate_id,
    idempotencyKey: item.idempotency_key,
    occurredAt: isoTime(item.created_at),
    payload: publicPayload(item.payload),
    attempt: item.attempt_count,
    ...(lead ? { lead: {
      crmLeadId: lead.legacy_id || lead.id,
      currentStatus: lead.status || null,
      externalSource: lead.external_source || null,
      externalLeadId: lead.external_lead_id || null,
      formId: lead.form_id || null,
      formName: lead.form_name || null,
      pageId: lead.page_id || null,
      leadCreatedAt: isoTime(lead.created_at)
    } } : {})
  };
}

async function claimOutboxBatch(sql, limit) {
  return sql.query(`WITH candidates AS (
      SELECT id FROM crm.outbox_events
      WHERE cancelled_at IS NULL AND (
        (status IN ('pending', 'failed') AND next_attempt_at <= now())
        OR (status = 'processing' AND coalesce(claimed_at, '-infinity'::timestamptz) < now() - make_interval(mins => $2)))
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE crm.outbox_events event
    SET status = 'processing', attempt_count = event.attempt_count + 1, claimed_at = now()
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.id, event.event_type, event.aggregate_type, event.aggregate_id, event.payload, event.idempotency_key, event.attempt_count, event.created_at`, [limit, CLAIM_TIMEOUT_MINUTES]);
}

async function loadLeadContext(sql, batch) {
  const ids = [...new Set(batch.filter(item => item.aggregate_type === 'lead' && item.aggregate_id).map(item => item.aggregate_id))];
  if (!ids.length) return new Map();
  const rows = await sql.query(`SELECT l.id, l.legacy_id, l.external_source, l.external_lead_id, l.created_at, s.name AS status,
      l.metadata->>'form_id' AS form_id, l.metadata->>'form_name' AS form_name,
      coalesce(l.metadata->>'source_page', l.metadata->>'page_id') AS page_id
    FROM crm.leads l LEFT JOIN crm.lead_statuses s ON s.id = l.status_id
    WHERE l.id = ANY($1::uuid[])`, [ids]);
  return new Map(rows.map(row => [row.id, row]));
}

// Exponential backoff (1, 2, 4 ... minutes, capped at 6 hours). After
// maxAttempts the event is parked as 'dead' instead of retrying forever.
async function markOutboxFailed(sql, item, error, maxAttempts) {
  const dead = item.attempt_count >= maxAttempts;
  await sql.query(`UPDATE crm.outbox_events SET status = $2,
      next_attempt_at = now() + least(power(2, greatest($3::int - 1, 0)), $4) * interval '1 minute', last_error = $5
    WHERE id = $1`, [item.id, dead ? 'dead' : 'failed', item.attempt_count, MAX_BACKOFF_MINUTES, String(error).slice(0, 2000)]);
  return dead;
}

async function processOutboxBatch({ sql, pool = null, send, limit = 25, maxAttempts = 10 }) {
  const batch = await claimOutboxBatch(sql, limit);
  const leads = await loadLeadContext(sql, batch);
  let delivered = 0;
  let failed = 0;
  let dead = 0;
  for (const item of batch) {
    const message = buildOutboxMessage(item, item.aggregate_type === 'lead' ? leads.get(item.aggregate_id) : null);
    try {
      if (pool) {
        await deliverOutboxItem(pool, item, () => send(message));
      } else {
        await send(message);
        await sql.query(`UPDATE crm.outbox_events SET status = 'delivered', delivered_at = now(), last_error = NULL WHERE id = $1`, [item.id]);
      }
      delivered += 1;
    } catch (error) {
      if (await markOutboxFailed(sql, item, error.message, maxAttempts)) dead += 1;
      else failed += 1;
    }
  }
  return { claimed: batch.length, delivered, failed, dead };
}

module.exports = { deliverOutboxItem, buildOutboxMessage, processOutboxBatch };
