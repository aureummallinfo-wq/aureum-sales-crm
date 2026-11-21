-- Lead date filters must reflect when the customer submitted a Meta form, not
-- when a later sheet or n8n job happened to create the CRM row. Manual leads
-- leave this value empty and therefore continue to use crm.leads.created_at.
ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- Preserve historical audit timestamps while safely promoting valid Meta
-- submission times already retained in lead metadata. Bad legacy values are
-- ignored rather than allowing one malformed row to block the migration.
ALTER TABLE crm.leads DISABLE TRIGGER set_updated_at;
DO $migration$
DECLARE
  item record;
  parsed_at timestamptz;
BEGIN
  FOR item IN
    SELECT id, coalesce(nullif(metadata->>'created_time', ''), nullif(metadata->>'submitted_at', ''), nullif(metadata->>'received_at', '')) AS raw_time
    FROM crm.leads
    WHERE received_at IS NULL
  LOOP
    BEGIN
      IF item.raw_time ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$' THEN
        parsed_at := replace(item.raw_time, ' ', 'T')::timestamp AT TIME ZONE 'Asia/Karachi';
      ELSE
        parsed_at := item.raw_time::timestamptz;
      END IF;
      IF parsed_at IS NOT NULL THEN
        UPDATE crm.leads SET received_at = parsed_at WHERE id = item.id;
      END IF;
    EXCEPTION WHEN others THEN
      -- Older free-form imports may contain non-date text. They should keep
      -- their CRM creation time instead of failing this safe schema update.
      NULL;
    END;
  END LOOP;
END
$migration$;
ALTER TABLE crm.leads ENABLE TRIGGER set_updated_at;

CREATE INDEX IF NOT EXISTS idx_crm_leads_received_at
  ON crm.leads(workspace_id, received_at DESC)
  WHERE received_at IS NOT NULL;
