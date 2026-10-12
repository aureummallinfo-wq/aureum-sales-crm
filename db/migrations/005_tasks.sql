-- Role-scoped task assignment for the Aureum CRM workspace.
-- This migration is additive and intentionally does not seed or alter CRM records.
CREATE TABLE IF NOT EXISTS crm.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled')),
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  assigned_to uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  assigned_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES crm.users(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES crm.leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES crm.customers(id) ON DELETE SET NULL,
  follow_up_id uuid REFERENCES crm.follow_ups(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_scope_status_due
  ON crm.tasks(workspace_id, assigned_team_id, status, due_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee_status_due
  ON crm.tasks(workspace_id, assigned_to, status, due_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_links
  ON crm.tasks(workspace_id, lead_id, customer_id, follow_up_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_created_by
  ON crm.tasks(workspace_id, created_by, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON crm.tasks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.tasks
  FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
