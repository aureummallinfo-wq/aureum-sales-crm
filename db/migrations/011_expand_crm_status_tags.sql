-- Keep the user-selected CRM status vocabulary available to leads, customers,
-- and follow-up tags. Existing records are retained; retired labels are mapped
-- to their closest selected status before their configuration rows are disabled.
DO $migration$
DECLARE
  approved text[] := ARRAY['New','Contacted','Qualified','Hot','Warm','Cold','Follow-up','Visit Scheduled','Visit Completed','Meeting Scheduled','Negotiation','Booking','Closed Won','Closed Lost','No Response','Not Interested','Invalid'];
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['lead_statuses','customer_statuses'] LOOP
    EXECUTE format('INSERT INTO crm.%I (workspace_id,legacy_id,name,slug,sort_order,is_default,is_active)
      SELECT w.id,''crm-status-'' || lower(regexp_replace(d.name,''[^a-zA-Z0-9]+'',''-'',''g'')),d.name,
        lower(regexp_replace(d.name,''[^a-zA-Z0-9]+'',''-'',''g'')),d.position,d.name=''New'',true
      FROM crm.workspaces w CROSS JOIN unnest($1::text[]) WITH ORDINALITY AS d(name,position)
      ON CONFLICT (workspace_id,slug) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,is_default=EXCLUDED.is_default,is_active=true', target) USING approved;
    EXECUTE format('UPDATE crm.%I SET is_active=false,is_default=false WHERE NOT (name=ANY($1))', target) USING approved;
  END LOOP;

  INSERT INTO crm.lead_tags (workspace_id,legacy_id,name,slug,tag_type,is_active)
    SELECT w.id,'crm-status-' || lower(regexp_replace(d.name,'[^a-zA-Z0-9]+','-','g')),d.name,
      lower(regexp_replace(d.name,'[^a-zA-Z0-9]+','-','g')),'status',true
    FROM crm.workspaces w CROSS JOIN unnest(approved) AS d(name)
    ON CONFLICT (workspace_id,slug) DO UPDATE SET name=EXCLUDED.name,tag_type='status',is_active=true;
  UPDATE crm.lead_tags SET is_active=false WHERE NOT (name=ANY(approved));

  UPDATE crm.leads AS lead
  SET metadata=coalesce(lead.metadata,'{}'::jsonb) || jsonb_build_object('previous_status', current.status_name),
      status_id=(SELECT id FROM crm.lead_statuses WHERE workspace_id=lead.workspace_id AND name=CASE current.status_name
        WHEN 'Active' THEN 'New' WHEN 'Interested' THEN 'Hot' WHEN 'Booking Interested' THEN 'Booking' WHEN 'Follow-up Needed' THEN 'Follow-up' ELSE current.status_name END LIMIT 1)
  FROM (SELECT l.id, s.name AS status_name FROM crm.leads l JOIN crm.lead_statuses s ON s.id=l.status_id) AS current
  WHERE lead.id=current.id AND current.status_name IN ('Active','Interested','Booking Interested','Follow-up Needed');

  UPDATE crm.customers
  SET metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('previous_status', customer_status),
      customer_status=CASE customer_status
        WHEN 'Active' THEN 'New' WHEN 'Interested' THEN 'Hot' WHEN 'Booking Interested' THEN 'Booking' WHEN 'Follow-up Needed' THEN 'Follow-up' ELSE customer_status END
  WHERE customer_status IN ('Active','Interested','Booking Interested','Follow-up Needed');

  UPDATE crm.follow_ups
  SET metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'previous_followup_tag', metadata->>'followup_tag',
    'followup_tag', CASE metadata->>'followup_tag' WHEN 'Active' THEN 'New' WHEN 'Interested' THEN 'Hot' WHEN 'Booking Interested' THEN 'Booking' WHEN 'Follow-up Needed' THEN 'Follow-up' ELSE metadata->>'followup_tag' END
  )
  WHERE metadata->>'followup_tag' IN ('Active','Interested','Booking Interested','Follow-up Needed');
END
$migration$;
