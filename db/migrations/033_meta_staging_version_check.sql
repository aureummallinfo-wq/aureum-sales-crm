-- Make the lightweight Meta Intake change check fast without reading payload data.
CREATE INDEX IF NOT EXISTS meta_lead_staging_workspace_updated_idx
  ON crm.meta_lead_staging (workspace_id, updated_at DESC);
