-- Repair follow-ups that were given a terminal status tag without going
-- through the opportunity lifecycle transition.
--
-- The old note path stored tags on lead/customer metadata but left the
-- canonical status, next action and follow-up row unchanged. Reuse the
-- audited transition function so existing history is preserved and active
-- reminders become cancellation tombstones instead of being deleted.

DO $$
DECLARE
  item record;
  actor_id uuid;
  target_status text;
  source_tags jsonb;
  cleaned_tags jsonb;
BEGIN
  FOR item IN
    SELECT l.id AS lead_id,
           l.workspace_id,
           l.metadata AS lead_metadata,
           c.metadata AS customer_metadata,
           coalesce(ls.name, '') AS lead_status,
           coalesce(c.customer_status, '') AS customer_status,
           l.assigned_agent_id,
           l.assigned_team_id,
           CASE WHEN jsonb_typeof(l.metadata->'tags') = 'array' THEN l.metadata->'tags' ELSE '[]'::jsonb END AS lead_tags,
           CASE WHEN jsonb_typeof(c.metadata->'tags') = 'array' THEN c.metadata->'tags' ELSE '[]'::jsonb END AS customer_tags,
           CASE WHEN jsonb_typeof(f.metadata->'tags') = 'array' THEN f.metadata->'tags' ELSE '[]'::jsonb END AS followup_tags,
           coalesce(l.metadata->>'followup_tag', c.metadata->>'followup_tag', f.metadata->>'followup_tag') AS primary_tag
      FROM crm.leads l
      LEFT JOIN crm.customers c
        ON c.workspace_id = l.workspace_id
       AND c.lead_id = l.id
       AND c.deleted_at IS NULL
      LEFT JOIN crm.lead_statuses ls ON ls.id = l.status_id
      LEFT JOIN LATERAL (
        SELECT fu.metadata
          FROM crm.follow_ups fu
         WHERE fu.workspace_id = l.workspace_id
           AND fu.deleted_at IS NULL
           AND (fu.lead_id = l.id OR fu.customer_id = c.id)
         ORDER BY CASE WHEN fu.status NOT IN ('Completed', 'Cancelled') THEN 0 ELSE 1 END,
                  fu.updated_at DESC,
                  fu.id DESC
         LIMIT 1
      ) f ON true
     WHERE l.deleted_at IS NULL
       AND (
         lower(replace(trim(coalesce(l.metadata->>'followup_tag', '')),'_',' ')) IN ('closed won','closed lost','not interested')
         OR lower(replace(trim(coalesce(c.metadata->>'followup_tag', '')),'_',' ')) IN ('closed won','closed lost','not interested')
         OR lower(replace(trim(coalesce(f.metadata->>'followup_tag', '')),'_',' ')) IN ('closed won','closed lost','not interested')
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(
               (CASE WHEN jsonb_typeof(l.metadata->'tags') = 'array' THEN l.metadata->'tags' ELSE '[]'::jsonb END) ||
               (CASE WHEN jsonb_typeof(c.metadata->'tags') = 'array' THEN c.metadata->'tags' ELSE '[]'::jsonb END) ||
               (CASE WHEN jsonb_typeof(f.metadata->'tags') = 'array' THEN f.metadata->'tags' ELSE '[]'::jsonb END)
             ) tag
            WHERE lower(replace(trim(tag),'_',' ')) IN ('closed won','closed lost','not interested')
         )
       )
  LOOP
    target_status := CASE
      WHEN lower(replace(trim(coalesce(item.primary_tag, '')),'_',' ')) = 'closed won' THEN 'Closed Won'
      WHEN lower(replace(trim(coalesce(item.primary_tag, '')),'_',' ')) = 'closed lost' THEN 'Closed Lost'
      WHEN lower(replace(trim(coalesce(item.primary_tag, '')),'_',' ')) = 'not interested' THEN 'Not Interested'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(item.lead_tags || item.customer_tags || item.followup_tags) tag
        WHERE lower(replace(trim(tag),'_',' ')) = 'closed won'
      ) THEN 'Closed Won'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(item.lead_tags || item.customer_tags || item.followup_tags) tag
        WHERE lower(replace(trim(tag),'_',' ')) = 'closed lost'
      ) THEN 'Closed Lost'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(item.lead_tags || item.customer_tags || item.followup_tags) tag
        WHERE lower(replace(trim(tag),'_',' ')) = 'not interested'
      ) THEN 'Not Interested'
      ELSE NULL
    END;

    IF target_status IS NULL
       OR item.lead_status IN ('Closed Won', 'Closed Lost', 'Not Interested')
       OR item.customer_status IN ('Closed Won', 'Closed Lost', 'Not Interested') THEN
      CONTINUE;
    END IF;

    -- Prefer a super admin, then an owner who is authorized by the
    -- transition function for this opportunity.
    SELECT u.id
      INTO actor_id
      FROM crm.users u
     WHERE u.workspace_id = item.workspace_id
       AND u.deleted_at IS NULL
       AND u.status = 'active'
       AND u.role_key IN ('super_admin', 'sales_manager', 'sales_agent')
       AND (u.role_key = 'super_admin'
         OR (u.role_key = 'sales_manager' AND u.team_id = item.assigned_team_id)
         OR (u.role_key = 'sales_agent' AND u.id = item.assigned_agent_id))
     ORDER BY CASE
                WHEN u.role_key = 'super_admin' THEN 0
                WHEN u.role_key = 'sales_manager' THEN 1
                ELSE 2
              END,
              u.created_at,
              u.id
     LIMIT 1;

    IF actor_id IS NULL THEN
      RAISE EXCEPTION 'Cannot repair terminal follow-up for lead %: no active CRM actor exists', item.lead_id;
    END IF;

    source_tags := CASE
      WHEN jsonb_typeof(item.lead_tags) = 'array' AND jsonb_array_length(item.lead_tags) > 0 THEN item.lead_tags
      WHEN jsonb_typeof(item.customer_tags) = 'array' AND jsonb_array_length(item.customer_tags) > 0 THEN item.customer_tags
      ELSE item.followup_tags
    END;

    SELECT coalesce(jsonb_agg(tag), '[]'::jsonb)
      INTO cleaned_tags
      FROM jsonb_array_elements(coalesce(source_tags, '[]'::jsonb)) tag
     WHERE lower(replace(trim(tag #>> '{}'),'_',' ')) NOT IN ('closed won','closed lost','not interested','follow-up','follow-up needed');

    PERFORM crm.transition_opportunity(
      item.workspace_id,
      item.lead_id,
      actor_id,
      target_status,
      'Repaired terminal outcome saved as a follow-up tag',
      jsonb_build_object('tags', cleaned_tags || jsonb_build_array(target_status)),
      'lead'
    );
  END LOOP;
END $$;

