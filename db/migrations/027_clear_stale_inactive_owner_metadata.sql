BEGIN;

-- Older imported records keep a denormalized assigned_agent_id/assigned_agent
-- in metadata. Once the relational owner is cleared, those legacy keys must
-- not make the API or CRM UI display the inactive user as the current owner.
DO $$
DECLARE
  inactive_user RECORD;
BEGIN
  FOR inactive_user IN
    SELECT u.id, u.legacy_id, u.workspace_id, u.full_name
    FROM crm.users u
    WHERE u.status = 'inactive'
      AND u.deleted_at IS NULL
  LOOP
    UPDATE crm.leads
    SET metadata = metadata - 'assigned_agent_id' - 'assigned_agent',
        updated_at = now()
    WHERE workspace_id = inactive_user.workspace_id
      AND assigned_agent_id IS NULL
      AND (
        metadata->>'assigned_agent_id' IN (inactive_user.id::text, inactive_user.legacy_id)
        OR metadata->>'assigned_agent' = inactive_user.full_name
      );

    UPDATE crm.customers
    SET metadata = metadata - 'assigned_agent_id' - 'assigned_agent',
        updated_at = now()
    WHERE workspace_id = inactive_user.workspace_id
      AND assigned_agent_id IS NULL
      AND (
        metadata->>'assigned_agent_id' IN (inactive_user.id::text, inactive_user.legacy_id)
        OR metadata->>'assigned_agent' = inactive_user.full_name
      );
  END LOOP;
END $$;

COMMIT;
