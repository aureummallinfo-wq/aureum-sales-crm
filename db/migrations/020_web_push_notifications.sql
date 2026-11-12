-- Browser Push API subscriptions for CRM notifications.
-- A user may have multiple browsers; each subscription is independently revocable.
CREATE TABLE IF NOT EXISTS crm.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user
  ON crm.web_push_subscriptions (workspace_id, user_id, enabled);
