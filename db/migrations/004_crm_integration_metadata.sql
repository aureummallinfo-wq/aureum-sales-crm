ALTER TABLE crm.webhook_connections
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS default_lead_source text,
  ADD COLUMN IF NOT EXISTS default_lead_status text NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS default_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_assigned_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_assigned_agent_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_assign_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_check_rule text NOT NULL DEFAULT 'externalLeadId',
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unauthorized_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_webhook_connections_platform ON crm.webhook_connections(workspace_id, source_platform, status);

INSERT INTO crm.lead_sources (workspace_id, legacy_id, name, slug, is_default, is_active)
SELECT w.id, 'source_meta_lead_ads', 'Meta Lead Ads', 'meta-lead-ads', false, true
FROM crm.workspaces w
WHERE w.legacy_id = 'workspace_default'
ON CONFLICT (workspace_id, legacy_id) DO UPDATE
SET name = EXCLUDED.name, slug = EXCLUDED.slug, is_active = true;

INSERT INTO crm.lead_sources (workspace_id, legacy_id, name, slug, is_default, is_active)
SELECT w.id, 'source_webhook', 'Webhook', 'webhook', false, true
FROM crm.workspaces w
WHERE w.legacy_id = 'workspace_default'
ON CONFLICT (workspace_id, legacy_id) DO UPDATE
SET name = EXCLUDED.name, slug = EXCLUDED.slug, is_active = true;
