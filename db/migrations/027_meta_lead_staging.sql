-- Meta intake staging keeps inbound lead data reviewable before it becomes a
-- CRM relationship. The raw payload is retained for reconciliation, while
-- editable review fields are kept separate from the original Meta values.
CREATE TABLE IF NOT EXISTS crm.meta_lead_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  external_lead_id text,
  idempotency_key text NOT NULL,
  form_id text,
  form_name text,
  platform text NOT NULL DEFAULT 'meta',
  full_name text,
  phone text,
  whatsapp_number text,
  email text,
  city text,
  area text,
  interested_in text,
  property_type text,
  budget text,
  purpose text,
  buying_timeline text,
  campaign_name text,
  ad_name text,
  adset_name text,
  submitted_at timestamptz,
  review_status text NOT NULL DEFAULT 'Pending review'
    CHECK (review_status IN ('Pending review', 'Reviewed', 'Sent to CRM', 'Rejected', 'Failed')),
  feedback_status text NOT NULL DEFAULT 'Not queued'
    CHECK (feedback_status IN ('Not queued', 'Ready for Meta', 'Queued', 'Sent', 'Failed')),
  review_notes text,
  outcome text,
  crm_lead_id uuid REFERENCES crm.leads(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  feedback_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  reviewed_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  crm_sent_at timestamptz,
  feedback_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_staging_status
  ON crm.meta_lead_staging(workspace_id, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_lead_staging_received
  ON crm.meta_lead_staging(workspace_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_lead_staging_external
  ON crm.meta_lead_staging(workspace_id, external_lead_id)
  WHERE external_lead_id IS NOT NULL;

ALTER TABLE crm.webhook_connections
  ADD COLUMN IF NOT EXISTS intake_mode text NOT NULL DEFAULT 'crm'
  CHECK (intake_mode IN ('crm', 'staging'));

-- Existing Meta Lead Ads connections should pass through the review inbox too.
-- Non-Meta and generic webhook connections keep their existing direct-to-CRM behavior.
UPDATE crm.webhook_connections
SET intake_mode = 'staging', updated_at = now()
WHERE source_platform = 'meta'
  AND source_type = 'meta_lead_ads'
  AND intake_mode = 'crm';

