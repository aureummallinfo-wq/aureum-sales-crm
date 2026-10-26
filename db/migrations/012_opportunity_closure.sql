-- Opportunity lifecycle is independent of contact-wide communication consent.
ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS lifecycle_version integer NOT NULL DEFAULT 0;
ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS lifecycle_version integer NOT NULL DEFAULT 0;
ALTER TABLE crm.follow_ups ADD COLUMN IF NOT EXISTS cancelled_by_closure boolean NOT NULL DEFAULT false;
ALTER TABLE crm.outbox_events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION crm.transition_opportunity(w uuid, l uuid, actor uuid, target text, reason text, details jsonb DEFAULT '{}'::jsonb, origin text DEFAULT 'lead')
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE old crm.leads; who crm.users; sid uuid; closing boolean; was_closed boolean;
BEGIN
  SELECT * INTO old FROM crm.leads WHERE id=l AND workspace_id=w AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO who FROM crm.users WHERE id=actor AND workspace_id=w AND deleted_at IS NULL AND status='active';
  IF old.id IS NULL OR who.id IS NULL OR NOT coalesce((who.role_key='super_admin'
    OR (who.role_key='sales_manager' AND who.team_id=old.assigned_team_id)
    OR (who.role_key='sales_agent' AND who.id=old.assigned_agent_id)),false) THEN
    RAISE EXCEPTION 'Opportunity is outside your ownership scope';
  END IF;
  was_closed := EXISTS(SELECT 1 FROM crm.lead_statuses WHERE id=old.status_id AND name IN ('Not Interested','Closed Lost'));
  closing := target IN ('Not Interested','Closed Lost');
  IF closing THEN target := 'Closed Lost'; END IF;
  SELECT id INTO sid FROM crm.lead_statuses WHERE workspace_id=w AND name=target;
  IF sid IS NULL THEN RAISE EXCEPTION 'Unknown opportunity status'; END IF;
  -- Apply accompanying form edits inside the same transaction as closure.
  IF origin='lead' THEN
    UPDATE crm.leads SET full_name=CASE WHEN details ? 'full_name' THEN details->>'full_name' ELSE full_name END,
      phone=CASE WHEN details ? 'phone' THEN details->>'phone' ELSE phone END,
      whatsapp_number=CASE WHEN details ? 'whatsapp_number' THEN details->>'whatsapp_number' ELSE whatsapp_number END,
      email=CASE WHEN details ? 'email' THEN details->>'email' ELSE email END,
      city=CASE WHEN details ? 'city' THEN details->>'city' ELSE city END,
      area=CASE WHEN details ? 'area' THEN details->>'area' ELSE area END,
      interested_in=CASE WHEN details ? 'interested_in' THEN details->>'interested_in' ELSE interested_in END,
      property_type=CASE WHEN details ? 'property_type' THEN details->>'property_type' ELSE property_type END,
      budget=CASE WHEN details ? 'budget' THEN details->>'budget' ELSE budget END,
      preferred_location=CASE WHEN details ? 'preferred_location' THEN details->>'preferred_location' ELSE preferred_location END,
      purpose=CASE WHEN details ? 'purpose' THEN details->>'purpose' ELSE purpose END,
      buying_timeline=CASE WHEN details ? 'buying_timeline' THEN details->>'buying_timeline' ELSE buying_timeline END,
      priority=CASE WHEN details ? 'priority' THEN details->>'priority' ELSE priority END,
      source_id=CASE WHEN details ? 'lead_source' THEN coalesce((SELECT id FROM crm.lead_sources WHERE workspace_id=w AND name=details->>'lead_source' LIMIT 1),source_id) ELSE source_id END,
      financing_required=CASE WHEN details ? 'financing_required' THEN (details->>'financing_required')::boolean ELSE financing_required END,
      metadata=metadata || CASE WHEN details ? 'tags' AND NOT closing THEN jsonb_build_object('tags',details->'tags') ELSE '{}'::jsonb END WHERE id=l;
  ELSE
    UPDATE crm.customers SET full_name=CASE WHEN details ? 'full_name' THEN details->>'full_name' ELSE full_name END,
      phone=CASE WHEN details ? 'phone' THEN details->>'phone' ELSE phone END,
      whatsapp_number=CASE WHEN details ? 'whatsapp_number' THEN details->>'whatsapp_number' ELSE whatsapp_number END,
      email=CASE WHEN details ? 'email' THEN details->>'email' ELSE email END,
      metadata=metadata || coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(details) WHERE key=ANY(ARRAY['city','area','preferred_contact_method','interested_in','property_type','budget','preferred_location','purpose','buying_timeline','financing_required','lead_source','priority'])),'{}'::jsonb) || CASE WHEN details ? 'tags' AND NOT closing THEN jsonb_build_object('tags',details->'tags') ELSE '{}'::jsonb END WHERE workspace_id=w AND lead_id=l AND deleted_at IS NULL;
  END IF;
  IF old.status_id=sid AND old.lifecycle_version>0 THEN RETURN false; END IF;
  UPDATE crm.leads SET status_id=sid, lifecycle_version=lifecycle_version+CASE WHEN closing OR was_closed THEN 1 ELSE 0 END,
    next_follow_up_at=CASE WHEN closing OR was_closed THEN NULL WHEN details ? 'next_follow_up_at' THEN nullif(details->>'next_follow_up_at','')::timestamptz ELSE next_follow_up_at END,
    metadata=metadata || jsonb_build_object('closure_reason',CASE WHEN closing THEN coalesce(nullif(trim(reason),''),'Not Interested') ELSE NULL END,
      'closed_at',CASE WHEN closing THEN now() ELSE NULL END,'lifecycle_changed_by',actor,
      'tags',CASE WHEN closing OR was_closed THEN coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(coalesce(details->'tags',metadata->'tags','[]'::jsonb)) WHERE value #>> '{}' NOT IN ('Follow-up','Follow-up Needed','Not Interested','Closed Lost')),'[]'::jsonb) || jsonb_build_array(target) ELSE coalesce(details->'tags',metadata->'tags','[]'::jsonb) END),updated_at=now() WHERE id=l;
  INSERT INTO crm.lead_status_history(lead_id,from_status_id,to_status_id,changed_by) VALUES(l,old.status_id,sid,actor);
  INSERT INTO crm.customer_status_history(customer_id,from_status,to_status,changed_by)
    SELECT id,customer_status,target,actor FROM crm.customers WHERE workspace_id=w AND lead_id=l AND deleted_at IS NULL;
  UPDATE crm.customers SET customer_status=target,lifecycle_version=lifecycle_version+1,
    metadata=metadata || jsonb_build_object('closure_reason',CASE WHEN closing THEN coalesce(nullif(trim(reason),''),'Not Interested') ELSE NULL END,
      'next_follow_up_at',CASE WHEN closing THEN NULL ELSE metadata->>'next_follow_up_at' END,
      'tags',CASE WHEN closing OR was_closed THEN coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(coalesce(details->'tags',metadata->'tags','[]'::jsonb)) WHERE value #>> '{}' NOT IN ('Follow-up','Follow-up Needed','Not Interested','Closed Lost')),'[]'::jsonb) || jsonb_build_array(target) ELSE coalesce(details->'tags',metadata->'tags','[]'::jsonb) END),updated_at=now()
    WHERE workspace_id=w AND lead_id=l AND deleted_at IS NULL;
  IF closing THEN
    INSERT INTO crm.follow_up_status_history(follow_up_id,from_status,to_status,changed_by)
      SELECT id,status,'Cancelled',actor FROM crm.follow_ups WHERE workspace_id=w AND
      (lead_id=l OR customer_id IN (SELECT id FROM crm.customers WHERE lead_id=l AND workspace_id=w))
      AND deleted_at IS NULL AND status NOT IN ('Completed','Cancelled');
    INSERT INTO crm.follow_up_activities(follow_up_id,actor_user_id,activity_type,description)
      SELECT id,actor,'Follow-up cancelled','Opportunity Closed Lost' FROM crm.follow_ups WHERE workspace_id=w AND
      (lead_id=l OR customer_id IN (SELECT id FROM crm.customers WHERE lead_id=l AND workspace_id=w))
      AND deleted_at IS NULL AND status NOT IN ('Completed','Cancelled');
    UPDATE crm.follow_ups SET status='Cancelled',cancelled_by_closure=true,
      metadata=metadata || jsonb_build_object('cancellation_reason','Opportunity Closed Lost','cancelled_at',now()),updated_at=now()
      WHERE workspace_id=w AND (lead_id=l OR customer_id IN (SELECT id FROM crm.customers WHERE lead_id=l AND workspace_id=w))
      AND deleted_at IS NULL AND status NOT IN ('Completed','Cancelled');
    UPDATE crm.outbox_events SET cancelled_at=now() WHERE workspace_id=w AND aggregate_type='follow_up'
      AND aggregate_id IN (SELECT id FROM crm.follow_ups WHERE cancelled_by_closure AND
        (lead_id=l OR customer_id IN (SELECT id FROM crm.customers WHERE lead_id=l AND workspace_id=w)))
      AND status IN ('pending','failed','processing');
    UPDATE crm.notifications SET is_read=true,read_at=now() WHERE related_entity_type='follow_up'
      AND event_key IN ('follow_up_due','follow_up_overdue') AND related_entity_id IN
      (SELECT id FROM crm.follow_ups WHERE workspace_id=w AND cancelled_by_closure AND
        (lead_id=l OR customer_id IN (SELECT id FROM crm.customers WHERE lead_id=l AND workspace_id=w)));
  END IF;
  INSERT INTO crm.lead_activities(lead_id,actor_user_id,activity_type,description)
    VALUES(l,actor,'Status changed',target || CASE WHEN closing THEN ': ' || coalesce(nullif(trim(reason),''),'Not Interested') WHEN was_closed THEN ' (reactivated)' ELSE '' END);
  INSERT INTO crm.customer_activities(customer_id,actor_user_id,activity_type,description)
    SELECT id,actor,'Status changed',target FROM crm.customers WHERE workspace_id=w AND lead_id=l AND deleted_at IS NULL;
  INSERT INTO crm.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,after_data)
    VALUES(w,actor,CASE WHEN closing THEN 'opportunity_closed_lost' WHEN was_closed THEN 'opportunity_reactivated' ELSE 'lead_status_changed' END,'lead',l,
      jsonb_build_object('status',target,'reason',reason,'version',old.lifecycle_version+1));
  INSERT INTO crm.outbox_events(workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    VALUES(w,'lead_status_changed','lead',l,jsonb_build_object('status',target,'reason',CASE WHEN closing THEN coalesce(nullif(trim(reason),''),'Not Interested') ELSE NULL END),
      CASE WHEN closing OR was_closed THEN 'opportunity:' || l::text || ':' || (old.lifecycle_version+1)::text
        ELSE 'lead_status_changed:' || gen_random_uuid()::text END)
    ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN true;
END $$;

-- Every scheduling path (including notes and legacy import) serializes on the
-- opportunity row. A cancelled reminder is a permanent tombstone; schedule a new
-- reminder after reactivation rather than resurrecting the previous one.
CREATE OR REPLACE FUNCTION crm.guard_closed_followup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lid uuid; closed boolean;
BEGIN
  IF TG_OP='UPDATE' AND OLD.cancelled_by_closure AND (NEW.status IS DISTINCT FROM OLD.status OR NOT NEW.cancelled_by_closure OR NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'Cancelled follow-up cannot be restored; create a new follow-up';
  END IF;
  lid := coalesce(NEW.lead_id,(SELECT lead_id FROM crm.customers WHERE id=NEW.customer_id AND workspace_id=NEW.workspace_id));
  SELECT s.name IN ('Closed Lost','Not Interested') INTO closed FROM crm.leads l
    LEFT JOIN crm.lead_statuses s ON s.id=l.status_id WHERE l.id=lid AND l.workspace_id=NEW.workspace_id FOR UPDATE OF l;
  IF closed AND NEW.status NOT IN ('Completed','Cancelled') THEN
    RAISE EXCEPTION 'Closed opportunity cannot have active follow-ups';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_closed_followup ON crm.follow_ups;
CREATE TRIGGER guard_closed_followup BEFORE INSERT OR UPDATE ON crm.follow_ups FOR EACH ROW EXECUTE FUNCTION crm.guard_closed_followup();

CREATE OR REPLACE FUNCTION crm.guard_closed_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.related_entity_type='follow_up' AND NEW.event_key IN ('follow_up_due','follow_up_overdue')
    AND EXISTS(SELECT 1 FROM crm.follow_ups WHERE id=NEW.related_entity_id AND (cancelled_by_closure OR status IN ('Completed','Cancelled'))) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_closed_notification ON crm.notifications;
CREATE TRIGGER guard_closed_notification BEFORE INSERT ON crm.notifications FOR EACH ROW EXECUTE FUNCTION crm.guard_closed_notification();

CREATE OR REPLACE FUNCTION crm.guard_closed_next_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM crm.lead_statuses WHERE id=NEW.status_id AND name IN ('Closed Lost','Not Interested')) THEN
    NEW.next_follow_up_at := NULL;
    NEW.metadata := NEW.metadata || jsonb_build_object('next_follow_up_at',NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_closed_next_action ON crm.leads;
CREATE TRIGGER guard_closed_next_action BEFORE INSERT OR UPDATE ON crm.leads FOR EACH ROW EXECUTE FUNCTION crm.guard_closed_next_action();
