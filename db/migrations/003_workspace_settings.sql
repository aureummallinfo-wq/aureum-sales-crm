-- Settings that are not naturally represented by the core CRM entities.
-- Kept as JSON values so the existing API can evolve without another schema
-- change for every preference field.
CREATE TABLE IF NOT EXISTS crm.workspace_settings (
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, setting_key)
);

CREATE TABLE IF NOT EXISTS crm.user_preferences (
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  preference_key text NOT NULL,
  preference_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preference_key)
);
