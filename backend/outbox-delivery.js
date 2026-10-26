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
module.exports = { deliverOutboxItem };
