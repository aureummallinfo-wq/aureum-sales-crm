-- Closed Won is a terminal opportunity state. Keep the customer profile and
-- history, but remove its active next action and cancel reminder tombstones.
CREATE OR REPLACE FUNCTION crm.cancel_closed_won_followups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  opportunity_id uuid;
  opportunity_status text;
BEGIN
  IF TG_TABLE_NAME = 'customers' THEN
    opportunity_id := NEW.lead_id;
    opportunity_status := NEW.customer_status;
  ELSE
    opportunity_id := NEW.id;
    SELECT ls.name INTO opportunity_status
    FROM crm.leads l
    LEFT JOIN crm.lead_statuses ls ON ls.id = l.status_id
    WHERE l.id = NEW.id;
  END IF;

  IF opportunity_id IS NULL OR coalesce(opportunity_status, '') <> 'Closed Won' THEN
    IF coalesce(opportunity_status, '') NOT IN ('Closed Lost', 'Not Interested') THEN
      UPDATE crm.leads
      SET metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{tags}',
        coalesce((
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(metadata->'tags') = 'array'
              THEN metadata->'tags' ELSE '[]'::jsonb END
          ) tag
          WHERE lower(tag #>> '{}') NOT IN ('follow-up', 'follow-up needed', 'not interested', 'not_interested', 'closed lost', 'closed_lost', 'closed won', 'closed_won')
        ), '[]'::jsonb),
        true
      ),
      updated_at = now()
      WHERE id = opportunity_id AND deleted_at IS NULL;

      UPDATE crm.customers
      SET metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{tags}',
        coalesce((
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(metadata->'tags') = 'array'
              THEN metadata->'tags' ELSE '[]'::jsonb END
          ) tag
          WHERE lower(tag #>> '{}') NOT IN ('follow-up', 'follow-up needed', 'not interested', 'not_interested', 'closed lost', 'closed_lost', 'closed won', 'closed_won')
        ), '[]'::jsonb),
        true
      ),
      updated_at = now()
      WHERE lead_id = opportunity_id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
  END IF;

  UPDATE crm.leads
  SET next_follow_up_at = NULL,
      lifecycle_version = greatest(coalesce(lifecycle_version, 0), 1),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'next_follow_up_at', NULL,
        'closed_at', coalesce(metadata->>'closed_at', now()::text),
        'tags', coalesce((
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(metadata->'tags') = 'array'
              THEN metadata->'tags' ELSE '[]'::jsonb END
          ) tag
          WHERE lower(tag #>> '{}') NOT IN ('follow-up', 'follow-up needed', 'not interested', 'not_interested', 'closed lost', 'closed_lost', 'closed won', 'closed_won')
        ), '[]'::jsonb) || jsonb_build_array('Closed Won')
      ),
      updated_at = now()
  WHERE id = opportunity_id AND deleted_at IS NULL;

  UPDATE crm.customers
  SET customer_status = 'Closed Won'
  WHERE lead_id = opportunity_id
    AND deleted_at IS NULL
    AND customer_status IS DISTINCT FROM 'Closed Won';

  UPDATE crm.customers
  SET lifecycle_version = greatest(coalesce(lifecycle_version, 0), 1),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'next_follow_up_at', NULL,
        'closed_at', coalesce(metadata->>'closed_at', now()::text),
        'tags', coalesce((
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(metadata->'tags') = 'array'
              THEN metadata->'tags' ELSE '[]'::jsonb END
          ) tag
          WHERE lower(tag #>> '{}') NOT IN ('follow-up', 'follow-up needed', 'not interested', 'not_interested', 'closed lost', 'closed_lost', 'closed won', 'closed_won')
        ), '[]'::jsonb) || jsonb_build_array('Closed Won')
      ),
      updated_at = now()
  WHERE lead_id = opportunity_id AND deleted_at IS NULL;

  UPDATE crm.follow_ups
  SET status = 'Cancelled',
      cancelled_by_closure = true,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_reason', 'Opportunity Closed Won',
        'cancelled_at', now()
      ),
      updated_at = now()
  WHERE workspace_id = NEW.workspace_id
    AND deleted_at IS NULL
    AND (lead_id = opportunity_id OR customer_id IN (
      SELECT id FROM crm.customers WHERE workspace_id = NEW.workspace_id AND lead_id = opportunity_id
    ))
    AND status NOT IN ('Completed', 'Cancelled');

  UPDATE crm.outbox_events
  SET cancelled_at = now()
  WHERE workspace_id = NEW.workspace_id
    AND aggregate_type = 'follow_up'
    AND aggregate_id IN (
      SELECT id FROM crm.follow_ups
      WHERE workspace_id = NEW.workspace_id
        AND cancelled_by_closure
        AND (lead_id = opportunity_id OR customer_id IN (
          SELECT id FROM crm.customers WHERE workspace_id = NEW.workspace_id AND lead_id = opportunity_id
        ))
    )
    AND status IN ('pending', 'failed', 'processing');

  UPDATE crm.notifications
  SET is_read = true,
      read_at = coalesce(read_at, now())
  WHERE related_entity_type = 'follow_up'
    AND event_key IN ('follow_up_due', 'follow_up_overdue')
    AND related_entity_id IN (
      SELECT id FROM crm.follow_ups
      WHERE workspace_id = NEW.workspace_id
        AND cancelled_by_closure
        AND (lead_id = opportunity_id OR customer_id IN (
          SELECT id FROM crm.customers WHERE workspace_id = NEW.workspace_id AND lead_id = opportunity_id
        ))
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cancel_closed_won_followups_on_lead ON crm.leads;
CREATE TRIGGER cancel_closed_won_followups_on_lead
AFTER UPDATE OF status_id ON crm.leads
FOR EACH ROW EXECUTE FUNCTION crm.cancel_closed_won_followups();

DROP TRIGGER IF EXISTS cancel_closed_won_followups_on_customer ON crm.customers;
CREATE TRIGGER cancel_closed_won_followups_on_customer
AFTER UPDATE OF customer_status ON crm.customers
FOR EACH ROW EXECUTE FUNCTION crm.cancel_closed_won_followups();

CREATE OR REPLACE FUNCTION crm.guard_closed_followup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lid uuid; closed boolean;
BEGIN
  IF TG_OP='UPDATE' AND OLD.cancelled_by_closure AND (NEW.status IS DISTINCT FROM OLD.status OR NOT NEW.cancelled_by_closure OR NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'Cancelled follow-up cannot be restored; create a new follow-up';
  END IF;
  lid := coalesce(NEW.lead_id,(SELECT lead_id FROM crm.customers WHERE id=NEW.customer_id AND workspace_id=NEW.workspace_id));
  SELECT s.name IN ('Closed Won','Closed Lost','Not Interested') INTO closed FROM crm.leads l
    LEFT JOIN crm.lead_statuses s ON s.id=l.status_id WHERE l.id=lid AND l.workspace_id=NEW.workspace_id FOR UPDATE OF l;
  IF closed AND NEW.status NOT IN ('Completed','Cancelled') THEN
    RAISE EXCEPTION 'Closed opportunity cannot have active follow-ups';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crm.guard_closed_next_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM crm.lead_statuses WHERE id=NEW.status_id AND name IN ('Closed Won','Closed Lost','Not Interested')) THEN
    NEW.next_follow_up_at := NULL;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('next_follow_up_at',NULL);
  END IF;
  RETURN NEW;
END $$;

-- Repair existing Closed Won rows created before this lifecycle rule existed.
UPDATE crm.leads l
SET status_id = l.status_id
FROM crm.lead_statuses ls
WHERE ls.id = l.status_id
  AND ls.workspace_id = l.workspace_id
  AND ls.name = 'Closed Won'
  AND l.deleted_at IS NULL;

UPDATE crm.customers c
SET customer_status = c.customer_status
WHERE c.customer_status = 'Closed Won'
  AND c.deleted_at IS NULL;
