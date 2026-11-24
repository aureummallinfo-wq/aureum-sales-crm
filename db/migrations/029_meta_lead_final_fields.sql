-- Final canonical Meta lead fields that are present in the source forms but
-- were previously retained only inside raw_payload.
ALTER TABLE crm.meta_lead_staging
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS investment_type text,
  ADD COLUMN IF NOT EXISTS down_payment text,
  ADD COLUMN IF NOT EXISTS active_contact text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text;
