-- Preserve ownership history while making account deactivation safe and fast.
-- Open leads are moved to the Unassigned queue by the repository workflow;
-- follow-ups remain owned by the active team manager so no action is lost.

CREATE INDEX IF NOT EXISTS idx_crm_leads_active_assignee
  ON crm.leads (workspace_id, assigned_agent_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_follow_ups_active_assignee
  ON crm.follow_ups (workspace_id, assigned_agent_id, status, due_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_lead_assignment_history_lead_created
  ON crm.lead_assignment_history (lead_id, created_at DESC);

