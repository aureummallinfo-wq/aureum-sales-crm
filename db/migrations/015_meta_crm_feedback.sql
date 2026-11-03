-- Outbox delivery feeds the n8n -> Meta CRM conversion workflow. Workers stamp
-- their claim so an abandoned claim can be retried, back off between failures
-- and park events that keep failing as 'dead' for an administrator to review.
ALTER TABLE crm.outbox_events ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE crm.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE crm.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead'));

-- Webhook intake previously kept the Meta lead ID only in metadata. Promote it to
-- the unique column so feedback events can carry it. When the same external ID
-- was imported more than once, the earliest lead keeps it. The backfill only adds
-- the identifier: updated_at and the closed-lead metadata trigger stay untouched.
ALTER TABLE crm.leads DISABLE TRIGGER set_updated_at;
ALTER TABLE crm.leads DISABLE TRIGGER guard_closed_next_action;
WITH promoted AS (
  SELECT DISTINCT ON (l.workspace_id, coalesce(c.source_platform, 'webhook'), l.metadata->>'external_lead_id')
    l.id, coalesce(c.source_platform, 'webhook') AS source, l.metadata->>'external_lead_id' AS external_id
  FROM crm.leads l
  LEFT JOIN crm.webhook_connections c ON c.workspace_id = l.workspace_id AND c.legacy_id = l.metadata->>'webhook_connection_id'
  WHERE l.external_lead_id IS NULL AND nullif(l.metadata->>'external_lead_id', '') IS NOT NULL
  ORDER BY l.workspace_id, coalesce(c.source_platform, 'webhook'), l.metadata->>'external_lead_id', l.created_at
)
UPDATE crm.leads l SET external_source = p.source, external_lead_id = p.external_id
FROM promoted p
WHERE l.id = p.id AND NOT EXISTS (
  SELECT 1 FROM crm.leads x WHERE x.workspace_id = l.workspace_id AND x.external_source = p.source AND x.external_lead_id = p.external_id
);
ALTER TABLE crm.leads ENABLE TRIGGER guard_closed_next_action;
ALTER TABLE crm.leads ENABLE TRIGGER set_updated_at;
