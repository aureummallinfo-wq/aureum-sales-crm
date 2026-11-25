-- Keep the Meta Intake list query ordered by the same timestamp used by the UI.
-- The raw and feedback payloads are loaded only by the detail endpoint.
CREATE INDEX IF NOT EXISTS meta_lead_staging_workspace_received_sort_idx
  ON crm.meta_lead_staging (workspace_id, submitted_at DESC NULLS LAST, created_at DESC);
