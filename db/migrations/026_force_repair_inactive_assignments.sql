BEGIN;

-- The original repair migration was allowed to skip a user when it could not
-- resolve an audit actor. That made the migration ledger say "applied" while
-- leaving the inactive user as the current owner. This migration makes the
-- ownership repair authoritative: leads and customers are unassigned even if
-- no active actor can be selected, while active follow-ups are handed to an
-- active user so no scheduled work is lost.
DO $$
DECLARE
  inactive_user RECORD;
  lead_row RECORD;
  actor_id uuid;
  customer_ids uuid[];
  changed_count integer;
BEGIN
  FOR inactive_user IN
    SELECT u.id, u.legacy_id, u.workspace_id, u.team_id, u.full_name
    FROM crm.users u
    WHERE u.status = 'inactive'
      AND u.deleted_at IS NULL
  LOOP
    SELECT candidate.id
    INTO actor_id
    FROM crm.users candidate
    WHERE candidate.workspace_id = inactive_user.workspace_id
      AND candidate.status = 'active'
      AND candidate.deleted_at IS NULL
    ORDER BY CASE
      WHEN candidate.role_key = 'super_admin' THEN 0
      WHEN candidate.role_key = 'sales_manager' THEN 1
      ELSE 2
    END, candidate.created_at ASC
    LIMIT 1;

    FOR lead_row IN
      SELECT l.id, l.assigned_team_id
      FROM crm.leads l
      WHERE l.workspace_id = inactive_user.workspace_id
        AND (l.assigned_agent_id = inactive_user.id
          OR l.assigned_agent_id::text = inactive_user.legacy_id)
        AND l.deleted_at IS NULL
      FOR UPDATE
    LOOP
      SELECT COALESCE(array_agg(c.id), '{}'::uuid[])
      INTO customer_ids
      FROM crm.customers c
      WHERE c.workspace_id = inactive_user.workspace_id
        AND c.lead_id = lead_row.id
        AND c.deleted_at IS NULL;

      UPDATE crm.leads
      SET assigned_agent_id = NULL,
          assigned_team_id = lead_row.assigned_team_id,
          metadata = metadata || jsonb_build_object(
            'previous_assigned_agent_id', inactive_user.legacy_id,
            'previous_assigned_agent_name', inactive_user.full_name,
            'reassigned_reason', 'user_deactivated_repair',
            'reassigned_at', now()
          ),
          updated_at = now()
      WHERE id = lead_row.id
        AND workspace_id = inactive_user.workspace_id
        AND (assigned_agent_id = inactive_user.id
          OR assigned_agent_id::text = inactive_user.legacy_id);

      GET DIAGNOSTICS changed_count = ROW_COUNT;
      IF changed_count = 0 THEN
        CONTINUE;
      END IF;

      UPDATE crm.customers
      SET assigned_agent_id = NULL,
          assigned_team_id = lead_row.assigned_team_id,
          metadata = metadata || jsonb_build_object(
            'previous_assigned_agent_id', inactive_user.legacy_id,
            'previous_assigned_agent_name', inactive_user.full_name,
            'reassigned_reason', 'user_deactivated_repair',
            'reassigned_at', now()
          ),
          updated_at = now()
      WHERE workspace_id = inactive_user.workspace_id
        AND id = ANY(customer_ids);

      IF actor_id IS NOT NULL THEN
        UPDATE crm.follow_ups
        SET assigned_agent_id = actor_id,
            assigned_team_id = inactive_user.team_id,
            metadata = metadata || jsonb_build_object(
              'previous_assigned_agent_id', inactive_user.legacy_id,
              'previous_assigned_agent_name', inactive_user.full_name,
              'reassigned_reason', 'user_deactivated_repair',
              'reassigned_at', now()
            ),
            updated_at = now()
        WHERE workspace_id = inactive_user.workspace_id
          AND (assigned_agent_id = inactive_user.id
            OR assigned_agent_id::text = inactive_user.legacy_id)
          AND deleted_at IS NULL
          AND status IN ('Pending', 'Overdue', 'Rescheduled', 'Missed')
          AND (lead_id = lead_row.id OR customer_id = ANY(customer_ids));
      ELSE
        UPDATE crm.follow_ups
        SET status = 'Cancelled',
            metadata = metadata || jsonb_build_object(
              'previous_assigned_agent_id', inactive_user.legacy_id,
              'previous_assigned_agent_name', inactive_user.full_name,
              'reassigned_reason', 'user_deactivated_repair_no_active_owner',
              'reassigned_at', now()
            ),
            updated_at = now()
        WHERE workspace_id = inactive_user.workspace_id
          AND (assigned_agent_id = inactive_user.id
            OR assigned_agent_id::text = inactive_user.legacy_id)
          AND deleted_at IS NULL
          AND status IN ('Pending', 'Overdue', 'Rescheduled', 'Missed')
          AND (lead_id = lead_row.id OR customer_id = ANY(customer_ids));
      END IF;

      INSERT INTO crm.lead_assignment_history
        (lead_id, from_agent_id, to_agent_id, from_team_id, to_team_id, changed_by)
      VALUES
        (lead_row.id, inactive_user.id, NULL, lead_row.assigned_team_id,
         lead_row.assigned_team_id, actor_id);

      INSERT INTO crm.lead_activities
        (lead_id, actor_user_id, activity_type, description, metadata)
      VALUES
        (lead_row.id, actor_id, 'Lead unassigned',
         format('Moved to Unassigned because %s was deactivated.', inactive_user.full_name),
         jsonb_build_object(
           'previous_agent_id', inactive_user.legacy_id,
           'previous_agent_name', inactive_user.full_name,
           'reassigned_reason', 'user_deactivated_repair'
         ));

      INSERT INTO crm.audit_events
        (workspace_id, actor_user_id, action, entity_type, entity_id, after_data)
      VALUES
        (inactive_user.workspace_id, actor_id,
         'lead_unassigned_user_deactivated_repair', 'lead', lead_row.id,
         jsonb_build_object(
           'previous_agent_id', inactive_user.legacy_id,
           'previous_agent_name', inactive_user.full_name,
           'assigned_team_id', lead_row.assigned_team_id
         ));

      INSERT INTO crm.outbox_events
        (workspace_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key)
      VALUES
        (inactive_user.workspace_id, 'lead_unassigned', 'lead', lead_row.id,
         jsonb_build_object(
           'previous_agent_id', inactive_user.legacy_id,
           'assigned_agent_id', NULL,
           'assigned_team_id', lead_row.assigned_team_id,
           'reason', 'user_deactivated_repair'
         ),
         'lead_unassigned:user_deactivated_repair:' || inactive_user.id::text || ':' || lead_row.id::text)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM crm.leads l
    JOIN crm.users u ON u.id = l.assigned_agent_id
    WHERE l.deleted_at IS NULL
      AND u.status = 'inactive'
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Inactive lead assignments remain after repair';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM crm.follow_ups f
    JOIN crm.users u ON u.id = f.assigned_agent_id
    WHERE f.deleted_at IS NULL
      AND f.status IN ('Pending', 'Overdue', 'Rescheduled', 'Missed')
      AND u.status = 'inactive'
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Inactive active follow-up assignments remain after repair';
  END IF;
END $$;

COMMIT;
