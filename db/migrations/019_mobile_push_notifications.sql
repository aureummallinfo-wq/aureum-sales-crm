-- Device registration for native CRM push notifications.
-- The token is scoped to a workspace and user so one person can use more
-- than one phone while a signed-out device can be revoked safely.
CREATE TABLE IF NOT EXISTS crm.mobile_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  token_hash text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  device_name text,
  app_version text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user
  ON crm.mobile_push_tokens (workspace_id, user_id, enabled);
