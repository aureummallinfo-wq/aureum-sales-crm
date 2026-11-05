-- Webhook intake depends on an active status and source row in the workspace
-- catalog. Older production workspaces could predate the catalog seed, so
-- repair the canonical webhook values for every existing workspace.
DO $migration$
DECLARE
  approved text[] := ARRAY['New','Contacted','Qualified','Hot','Warm','Cold','Follow-up','Visit Scheduled','Visit Completed','Meeting Scheduled','Negotiation','Booking','Closed Won','Closed Lost','No Response','Not Interested','Invalid'];
BEGIN
  INSERT INTO crm.lead_statuses (workspace_id, name, slug, color, sort_order, is_default, is_active)
    SELECT w.id, d.name,
      lower(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g')),
      '#8d7658', d.position, d.name = 'New', true
    FROM crm.workspaces w
    CROSS JOIN unnest(approved) WITH ORDINALITY AS d(name, position)
    ON CONFLICT (workspace_id, slug) DO UPDATE
      SET name = EXCLUDED.name,
          color = COALESCE(crm.lead_statuses.color, EXCLUDED.color),
          sort_order = EXCLUDED.sort_order,
          is_default = EXCLUDED.is_default,
          is_active = true;

  INSERT INTO crm.lead_sources (workspace_id, name, slug, is_default, is_active)
    SELECT w.id, d.name, d.slug, false, true
    FROM crm.workspaces w
    CROSS JOIN (VALUES ('Meta Lead Ads', 'meta-lead-ads'), ('Webhook', 'webhook')) AS d(name, slug)
    ON CONFLICT (workspace_id, slug) DO UPDATE
      SET name = EXCLUDED.name,
          is_active = true;
END
$migration$;
