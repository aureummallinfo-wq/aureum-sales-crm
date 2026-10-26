-- Reconcile older Not Interested records that were created before the
-- opportunity lifecycle guards existed. The customer remains searchable, but
-- its active follow-ups and reminders become cancelled tombstones.
CREATE OR REPLACE FUNCTION crm.reconcile_legacy_closed_opportunities()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  reconciled_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM crm.lead_statuses WHERE name = 'Closed Lost'
  ) THEN
    RAISE EXCEPTION 'Closed Lost status is required before legacy reconciliation';
  END IF;

  CREATE TEMP TABLE legacy_closed_opportunities ON COMMIT DROP AS
  SELECT DISTINCT
    l.id AS lead_id,
    l.workspace_id,
    l.status_id AS old_status_id,
    c.id AS customer_id,
    c.customer_status AS old_customer_status,
    closed.id AS closed_status_id,
    coalesce(
      nullif(btrim(l.metadata->>'closure_reason'), ''),
      nullif(btrim(c.metadata->>'closure_reason'), ''),
      'Not Interested'
    ) AS reason,
    (l.metadata->>'legacy_not_interested_reconciled' IS DISTINCT FROM 'true'
      OR (c.id IS NOT NULL AND c.metadata->>'legacy_not_interested_reconciled' IS DISTINCT FROM 'true')) AS needs_reconcile
  FROM crm.leads l
  LEFT JOIN crm.customers c
    ON c.workspace_id = l.workspace_id
   AND c.lead_id = l.id
   AND c.deleted_at IS NULL
  LEFT JOIN crm.lead_statuses ls ON ls.id = l.status_id
  JOIN crm.lead_statuses closed
    ON closed.workspace_id = l.workspace_id
   AND closed.name = 'Closed Lost'
  WHERE l.deleted_at IS NULL
    AND (
      lower(coalesce(ls.name, '')) = 'not interested'
      OR lower(coalesce(c.customer_status, '')) = 'not interested'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(l.metadata->'tags') = 'array'
            THEN l.metadata->'tags' ELSE '[]'::jsonb END
        ) tag
        WHERE lower(tag #>> '{}') IN ('not interested', 'not_interested')
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(c.metadata->'tags') = 'array'
            THEN c.metadata->'tags' ELSE '[]'::jsonb END
        ) tag
        WHERE lower(tag #>> '{}') IN ('not interested', 'not_interested')
      )
    );

  SELECT count(*) INTO reconciled_count
  FROM legacy_closed_opportunities
  WHERE needs_reconcile;

  INSERT INTO crm.lead_status_history (lead_id, from_status_id, to_status_id, changed_by, reason)
  SELECT lead_id, old_status_id, closed_status_id, NULL, reason
  FROM legacy_closed_opportunities
  WHERE needs_reconcile
    AND old_status_id IS DISTINCT FROM closed_status_id;

  INSERT INTO crm.customer_status_history (customer_id, from_status, to_status, changed_by)
  SELECT customer_id, old_customer_status, 'Closed Lost', NULL
  FROM legacy_closed_opportunities
  WHERE needs_reconcile
    AND customer_id IS NOT NULL
    AND old_customer_status IS DISTINCT FROM 'Closed Lost';

  UPDATE crm.leads l
  SET status_id = candidate.closed_status_id,
      lifecycle_version = greatest(coalesce(l.lifecycle_version, 0), 1),
      next_follow_up_at = NULL,
      metadata = l.metadata || jsonb_build_object(
        'closure_reason', candidate.reason,
        'closed_at', coalesce(l.metadata->>'closed_at', now()::text),
        'legacy_not_interested_reconciled', true,
        'tags', coalesce((
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(l.metadata->'tags') = 'array'
              THEN l.metadata->'tags' ELSE '[]'::jsonb END
          ) tag
          WHERE lower(tag #>> '{}') NOT IN ('follow-up', 'follow-up needed', 'not interested', 'not_interested', 'closed lost', 'closed_lost')
        ), '[]'::jsonb) || jsonb_build_array('Closed Lost')
      ),
      updated_at = now()
  FROM legacy_closed_opportunities candidate
  WHERE l.id = candidate.lead_id;

  UPDATE crm.customers c
  SET customer_status = 'Closed Lost',
      lifecycle_version = greatest(coalesce(c.lifecycle_version, 0), 1),
      metadata = c.metadata || jsonb_build_object(
        'closure_reason', candidate.reason,
        'closed_at', coalesce(c.metadata->>'closed_at', now()::text),
        'next_follow_up_at', NULL,
        'legacy_not_interested_reconciled', true,
        'tags', coalesce((
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.metadata->'tags') = 'array'
              THEN c.metadata->'tags' ELSE '[]'::jsonb END
          ) tag
          WHERE lower(tag #>> '{}') NOT IN ('follow-up', 'follow-up needed', 'not interested', 'not_interested', 'closed lost', 'closed_lost')
        ), '[]'::jsonb) || jsonb_build_array('Closed Lost')
      ),
      updated_at = now()
  FROM legacy_closed_opportunities candidate
  WHERE c.id = candidate.customer_id;

  CREATE TEMP TABLE legacy_active_followups ON COMMIT DROP AS
  SELECT DISTINCT f.id, f.workspace_id, f.status
  FROM crm.follow_ups f
  JOIN legacy_closed_opportunities candidate
    ON candidate.workspace_id = f.workspace_id
   AND (f.lead_id = candidate.lead_id OR f.customer_id = candidate.customer_id)
  WHERE f.deleted_at IS NULL
    AND f.status NOT IN ('Completed', 'Cancelled');

  INSERT INTO crm.follow_up_status_history (follow_up_id, from_status, to_status, changed_by)
  SELECT id, status, 'Cancelled', NULL
  FROM legacy_active_followups;

  INSERT INTO crm.follow_up_activities (follow_up_id, actor_user_id, activity_type, description)
  SELECT id, NULL, 'Follow-up cancelled', 'Opportunity Closed Lost during legacy Not Interested reconciliation.'
  FROM legacy_active_followups;

  UPDATE crm.follow_ups f
  SET status = 'Cancelled',
      cancelled_by_closure = true,
      metadata = f.metadata || jsonb_build_object(
        'cancellation_reason', 'Opportunity Closed Lost',
        'cancelled_at', now()
      ),
      updated_at = now()
  WHERE f.id IN (SELECT id FROM legacy_active_followups);

  UPDATE crm.outbox_events o
  SET cancelled_at = now()
  WHERE o.aggregate_type = 'follow_up'
    AND o.aggregate_id IN (SELECT id FROM legacy_active_followups)
    AND o.status IN ('pending', 'failed', 'processing');

  UPDATE crm.notifications n
  SET is_read = true,
      read_at = coalesce(n.read_at, now())
  WHERE n.related_entity_type = 'follow_up'
    AND n.event_key IN ('follow_up_due', 'follow_up_overdue')
    AND n.related_entity_id IN (SELECT id FROM legacy_active_followups);

  INSERT INTO crm.lead_activities (lead_id, actor_user_id, activity_type, description)
  SELECT lead_id, NULL, 'Status changed', 'Closed Lost: ' || reason || ' (legacy Not Interested reconciliation)'
  FROM legacy_closed_opportunities
  WHERE needs_reconcile;

  INSERT INTO crm.customer_activities (customer_id, actor_user_id, activity_type, description)
  SELECT customer_id, NULL, 'Status changed', 'Closed Lost: ' || reason || ' (legacy Not Interested reconciliation)'
  FROM legacy_closed_opportunities
  WHERE needs_reconcile AND customer_id IS NOT NULL;

  INSERT INTO crm.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, after_data)
  SELECT workspace_id, NULL, 'legacy_opportunity_reconciled', 'lead', lead_id,
    jsonb_build_object('status', 'Closed Lost', 'reason', reason, 'cancelled_followups',
      (SELECT count(*) FROM legacy_active_followups active
       JOIN crm.follow_ups f ON f.id = active.id
       WHERE f.lead_id = legacy_closed_opportunities.lead_id
          OR f.customer_id = legacy_closed_opportunities.customer_id))
  FROM legacy_closed_opportunities
  WHERE needs_reconcile;

  RETURN reconciled_count;
END;
$$;

SELECT crm.reconcile_legacy_closed_opportunities();
