ALTER TABLE crm.meta_lead_staging
  ADD COLUMN IF NOT EXISTS campaign_id text,
  ADD COLUMN IF NOT EXISTS adset_id text,
  ADD COLUMN IF NOT EXISTS ad_id text,
  ADD COLUMN IF NOT EXISTS page_id text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_medium text,
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS ingested_via text,
  ADD COLUMN IF NOT EXISTS interest_category text,
  ADD COLUMN IF NOT EXISTS payment_preference text,
  ADD COLUMN IF NOT EXISTS residential_property_type text,
  ADD COLUMN IF NOT EXISTS residential_budget text,
  ADD COLUMN IF NOT EXISTS residential_investment_purpose text,
  ADD COLUMN IF NOT EXISTS commercial_property_type text,
  ADD COLUMN IF NOT EXISTS commercial_budget text,
  ADD COLUMN IF NOT EXISTS commercial_investment_purpose text,
  ADD COLUMN IF NOT EXISTS purchase_timeline text,
  ADD COLUMN IF NOT EXISTS site_visit_interest text,
  ADD COLUMN IF NOT EXISTS consent_status text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz;

CREATE INDEX IF NOT EXISTS meta_lead_staging_workspace_campaign_idx
  ON crm.meta_lead_staging (workspace_id, campaign_id);
CREATE INDEX IF NOT EXISTS meta_lead_staging_workspace_adset_idx
  ON crm.meta_lead_staging (workspace_id, adset_id);
CREATE INDEX IF NOT EXISTS meta_lead_staging_workspace_source_idx
  ON crm.meta_lead_staging (workspace_id, source_channel);
