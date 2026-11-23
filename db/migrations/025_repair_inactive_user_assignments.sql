BEGIN;

-- Repair assignments created before safe deactivation was deployed. Inactive
-- users must never remain the current owner of active leads or follow-ups.
DO $$
DECLARE
  inactive_user RECORD;
  lead_row RECORD;
  customer_ids uuid[];
BEGIN
  FOR inactive_user IN
    SELECT u.id,
           u.legacy_id,
           u.workspace_id,
           u.team_id,
           u.full_name,
           COALESCE(team_manager.id, fallback_owner.id) AS actor_id
    FROM crm.users u
    LEFT JOIN crm.teams t
      ON t.id = u.team_id
    LEFT JOIN crm.users team_manager
      ON team_manager.id = t.manager_user_id
     AND team_manager.workspace_id = u.workspace_id
     AND team_manager.status = 'active'
     AND team_manager.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT candidate.id
      FROM crm.users candidate
      WHERE candidate.workspace_id = u.workspace_id
        AND candidate.status = 'active'
        AND candidate.deleted_at IS NULL
      ORDER BY CASE
        WHEN candidate.role_key = 'super_admin' THEN 0
        WHEN candidate.role_key = 'sales_manager' THEN 1
        ELSE 2
      END, candidate.created_at ASC
      LIMIT 1
    ) fallback_owner ON true
    WHERE u.status = 'inactive'
      AND u.deleted_at IS NULL
  LOOP
    IF inactive_user.actor_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR lead_row IN
      SELECT l.id, l.legacy_id, l.assigned_team_id
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

      UPDATE crm.follow_ups
      SET assigned_agent_id = inactive_user.actor_id,
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
        AND workspace_id = inactive_user.workspace_id;

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

      INSERT INTO crm.lead_assignment_history
        (lead_id, from_agent_id, to_agent_id, from_team_id, to_team_id, changed_by)
      VALUES
        (lead_row.id, inactive_user.id, NULL, lead_row.assigned_team_id,
         lead_row.assigned_team_id, inactive_user.actor_id);

      INSERT INTO crm.lead_activities
        (lead_id, actor_user_id, activity_type, description, metadata)
      VALUES
        (lead_row.id, inactive_user.actor_id, 'Lead unassigned',
         format('Moved to Unassigned because %s was deactivated.', inactive_user.full_name),
         jsonb_build_object(
           'previous_agent_id', inactive_user.legacy_id,
           'previous_agent_name', inactive_user.full_name,
           'reassigned_reason', 'user_deactivated_repair'
         ));

      INSERT INTO crm.audit_events
        (workspace_id, actor_user_id, action, entity_type, entity_id, after_data)
      VALUES
        (inactive_user.workspace_id, inactive_user.actor_id,
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
END $$;

COMMIT;
