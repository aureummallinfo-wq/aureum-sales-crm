-- One business status vocabulary for leads, customers and follow-up status tags.
-- Retired definitions and original record labels remain available for history.
DO $migration$
DECLARE
  approved text[] := ARRAY['New','Contacted','Hot','Cold','Follow-up','Visit Scheduled','Visit Completed','Negotiation','Closed Won','No Response','Not Interested','Invalid'];
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['lead_statuses','customer_statuses'] LOOP
    EXECUTE format('INSERT INTO crm.%I (workspace_id,legacy_id,name,slug,sort_order,is_default,is_active)
      SELECT w.id,''crm-status-'' || lower(regexp_replace(d.name,''[^a-zA-Z0-9]+'',''-'',''g'')),d.name,
        lower(regexp_replace(d.name,''[^a-zA-Z0-9]+'',''-'',''g'')),d.position,d.name=''New'',true
      FROM crm.workspaces w CROSS JOIN unnest($1::text[]) WITH ORDINALITY AS d(name,position)
      ON CONFLICT (workspace_id,slug) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,is_default=EXCLUDED.is_default,is_active=true',target) USING approved;
    EXECUTE format('UPDATE crm.%I SET is_active=false,is_default=false WHERE NOT (name=ANY($1))',target) USING approved;
  END LOOP;

  INSERT INTO crm.lead_tags (workspace_id,legacy_id,name,slug,tag_type,is_active)
    SELECT w.id,'crm-status-' || lower(regexp_replace(d.name,'[^a-zA-Z0-9]+','-','g')),d.name,
      lower(regexp_replace(d.name,'[^a-zA-Z0-9]+','-','g')),'status',true
    FROM crm.workspaces w CROSS JOIN unnest(approved) AS d(name)
    ON CONFLICT (workspace_id,slug) DO UPDATE SET name=EXCLUDED.name,tag_type='status',is_active=true;
  UPDATE crm.lead_tags SET is_active=false WHERE NOT (name=ANY(approved));

  WITH mapping(old_label,new_label) AS (VALUES
    ('Active','New'),('Qualified','Contacted'),('Warm','Contacted'),('Interested','Hot'),
    ('Booking Interested','Hot'),('Meeting Scheduled','Visit Scheduled'),('Booking','Negotiation'),('Closed Lost','Not Interested')
  ), resolved AS (
    SELECT l.id,s.name AS previous_status,n.id AS status_id FROM crm.leads l
      JOIN crm.lead_statuses s ON s.id=l.status_id
      LEFT JOIN mapping m ON m.old_label=s.name
      JOIN crm.lead_statuses n ON n.workspace_id=l.workspace_id AND n.name=coalesce(m.new_label,CASE WHEN s.name=ANY(approved) THEN s.name ELSE 'New' END)
    WHERE s.id<>n.id
  ) UPDATE crm.leads l SET status_id=r.status_id,metadata=l.metadata || jsonb_build_object('previous_status',r.previous_status)
    FROM resolved r WHERE l.id=r.id;

  WITH mapping(old_label,new_label) AS (VALUES
    ('Active','New'),('Qualified','Contacted'),('Warm','Contacted'),('Interested','Hot'),
    ('Booking Interested','Hot'),('Meeting Scheduled','Visit Scheduled'),('Booking','Negotiation'),('Closed Lost','Not Interested')
  ), resolved AS (
    SELECT c.id,c.customer_status AS previous_status,coalesce(m.new_label,'New') AS next_status
    FROM crm.customers c LEFT JOIN mapping m ON m.old_label=c.customer_status WHERE NOT (c.customer_status=ANY(approved))
  ) UPDATE crm.customers c SET customer_status=r.next_status,metadata=c.metadata || jsonb_build_object('previous_status',r.previous_status)
    FROM resolved r WHERE c.id=r.id;

  UPDATE crm.follow_ups f SET metadata=f.metadata || jsonb_build_object(
    'previous_followup_tag',f.metadata->>'followup_tag','followup_tag',coalesce(s.name,'Follow-up'))
    FROM crm.leads l LEFT JOIN crm.lead_statuses s ON s.id=l.status_id
    WHERE f.lead_id=l.id AND f.metadata ? 'followup_tag' AND NOT ((f.metadata->>'followup_tag')=ANY(approved));
END
$migration$;

ALTER TABLE crm.customers ALTER COLUMN customer_status SET DEFAULT 'New';
