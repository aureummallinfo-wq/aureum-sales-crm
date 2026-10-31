-- Original author/creation time remain immutable. Revision numbers are CAS tokens.
ALTER TABLE crm.lead_notes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE crm.lead_notes ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES crm.users(id);
ALTER TABLE crm.customer_notes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE crm.customer_notes ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES crm.users(id);
CREATE TABLE IF NOT EXISTS crm.note_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id),
  note_kind text NOT NULL CHECK (note_kind IN ('lead','customer')),
  note_id uuid NOT NULL,
  version integer NOT NULL,
  previous_content text NOT NULL,
  new_content text NOT NULL,
  edited_by uuid NOT NULL REFERENCES crm.users(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(note_kind,note_id,version)
);

-- Only link historical activities when the association is unambiguous.
DO $$ DECLARE kind text; BEGIN
  FOREACH kind IN ARRAY ARRAY['lead','customer'] LOOP
    EXECUTE format('UPDATE crm.%1$s_activities a SET metadata=a.metadata || jsonb_build_object(''note_id'',n.id::text)
      FROM crm.%1$s_notes n WHERE a.%1$s_id=n.%1$s_id AND a.actor_user_id=n.author_user_id
      AND a.description=n.note AND a.created_at=n.created_at
      AND NOT (a.metadata ? ''note_id'') AND (SELECT count(*) FROM crm.%1$s_notes x
        WHERE x.%1$s_id=n.%1$s_id AND x.author_user_id=n.author_user_id AND x.note=n.note AND x.created_at=n.created_at)=1',kind);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION crm.protect_edited_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.version>1 AND NEW.version=OLD.version THEN RETURN OLD; END IF;
  IF NEW.version<>OLD.version THEN
    IF NEW.version<>OLD.version+1 OR NEW.edited_by IS NULL THEN RAISE EXCEPTION 'Invalid note revision'; END IF;
    NEW.id=OLD.id; NEW.author_user_id=OLD.author_user_id; NEW.created_at=OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_edited_note ON crm.lead_notes;
CREATE TRIGGER protect_edited_note BEFORE UPDATE ON crm.lead_notes FOR EACH ROW EXECUTE FUNCTION crm.protect_edited_note();
DROP TRIGGER IF EXISTS protect_edited_note ON crm.customer_notes;
CREATE TRIGGER protect_edited_note BEFORE UPDATE ON crm.customer_notes FOR EACH ROW EXECUTE FUNCTION crm.protect_edited_note();

-- Legacy imports must not restore stale copies of edited timeline descriptions.
CREATE OR REPLACE FUNCTION crm.protect_edited_note_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.metadata ? 'note_edited_at' AND
    (NEW.metadata->>'note_edited_at' IS NULL OR NEW.metadata->>'note_edited_at'=OLD.metadata->>'note_edited_at') THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_edited_note_activity ON crm.lead_activities;
CREATE TRIGGER protect_edited_note_activity BEFORE UPDATE ON crm.lead_activities FOR EACH ROW EXECUTE FUNCTION crm.protect_edited_note_activity();
DROP TRIGGER IF EXISTS protect_edited_note_activity ON crm.customer_activities;
CREATE TRIGGER protect_edited_note_activity BEFORE UPDATE ON crm.customer_activities FOR EACH ROW EXECUTE FUNCTION crm.protect_edited_note_activity();

CREATE OR REPLACE FUNCTION crm.edit_saved_note(w uuid, kind text, parent uuid, nid uuid, actor uuid, expected integer, content text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE n record; p record; u record; changed record; tbl text;
BEGIN
  IF kind NOT IN ('lead','customer') THEN RAISE EXCEPTION 'Invalid note kind'; END IF;
  IF content IS NULL OR length(btrim(content))=0 OR length(content)>2000 THEN RETURN jsonb_build_object('status',422,'error','Enter 1–2000 characters.'); END IF;
  SELECT * INTO u FROM crm.users WHERE id=actor AND workspace_id=w AND status='active' AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status',403,'error','Access denied'); END IF;
  tbl=kind || '_notes';
  EXECUTE format('SELECT * FROM crm.%I WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR SHARE',kind || 's') INTO p USING parent,w;
  IF p.id IS NULL THEN RETURN jsonb_build_object('status',404,'error','Record not found'); END IF;
  IF NOT coalesce((u.role_key='super_admin' OR (u.role_key='sales_manager' AND u.team_id=p.assigned_team_id) OR (u.role_key='sales_agent' AND u.id=p.assigned_agent_id)),false) THEN
    RETURN jsonb_build_object('status',403,'error','Record outside your scope'); END IF;
  EXECUTE format('SELECT * FROM crm.%I WHERE id=$1 AND %I=$2 AND deleted_at IS NULL FOR UPDATE',tbl,kind || '_id') INTO n USING nid,parent;
  IF n.id IS NULL THEN RETURN jsonb_build_object('status',404,'error','Note not found'); END IF;
  -- User-approved policy: managers may edit notes in their assigned team.
  IF NOT coalesce((n.author_user_id=u.id OR (u.role_key='sales_manager' AND u.team_id=p.assigned_team_id)),false) THEN
    RETURN jsonb_build_object('status',403,'error','Only the author or their team manager may edit this note'); END IF;
  IF expected IS NULL OR expected<>n.version THEN RETURN jsonb_build_object('status',409,'error','This note changed. Review the latest note before saving.'); END IF;
  IF n.note=btrim(content) THEN RETURN jsonb_build_object('status',200,'data',to_jsonb(n)); END IF;
  EXECUTE format('UPDATE crm.%I SET note=$1,version=version+1,edited_by=$2,updated_at=now() WHERE id=$3 RETURNING *',tbl) INTO changed USING btrim(content),actor,nid;
  INSERT INTO crm.note_revisions(workspace_id,note_kind,note_id,version,previous_content,new_content,edited_by)
    VALUES(w,kind,nid,changed.version,n.note,changed.note,actor);
  -- Update only the timeline projection explicitly associated with this note.
  UPDATE crm.lead_activities SET description=changed.note,metadata=metadata || jsonb_build_object('note_edited_at',changed.updated_at,'note_edited_by',u.full_name)
    WHERE metadata->>'note_id'=nid::text AND lead_id IN (SELECT id FROM crm.leads WHERE workspace_id=w);
  UPDATE crm.customer_activities SET description=changed.note,metadata=metadata || jsonb_build_object('note_edited_at',changed.updated_at,'note_edited_by',u.full_name)
    WHERE metadata->>'note_id'=nid::text AND customer_id IN (SELECT id FROM crm.customers WHERE workspace_id=w);
  -- Imported notes may have no provable timeline association. Keep old activities
  -- intact and add a canonical projection rather than guessing which to rewrite.
  INSERT INTO crm.lead_activities(lead_id,actor_user_id,activity_type,description,metadata,created_at)
    SELECT l.id,n.author_user_id,'Note added',changed.note,jsonb_build_object('note_id',nid::text,'note_edited_at',changed.updated_at,'note_edited_by',u.full_name),n.created_at
    FROM crm.leads l WHERE l.workspace_id=w AND l.deleted_at IS NULL
      AND (l.id=CASE WHEN kind='lead' THEN parent ELSE (to_jsonb(p)->>'lead_id')::uuid END)
      AND NOT EXISTS(SELECT 1 FROM crm.lead_activities a WHERE a.lead_id=l.id AND a.metadata->>'note_id'=nid::text);
  INSERT INTO crm.customer_activities(customer_id,actor_user_id,activity_type,description,metadata,created_at)
    SELECT c.id,n.author_user_id,'Note added',changed.note,jsonb_build_object('note_id',nid::text,'note_edited_at',changed.updated_at,'note_edited_by',u.full_name),n.created_at
    FROM crm.customers c WHERE c.workspace_id=w AND c.deleted_at IS NULL
      AND (c.id=parent OR c.lead_id=parent)
      AND NOT EXISTS(SELECT 1 FROM crm.customer_activities a WHERE a.customer_id=c.id AND a.metadata->>'note_id'=nid::text);
  RETURN jsonb_build_object('status',200,'data',to_jsonb(changed) || jsonb_build_object('edited_by_name',u.full_name));
END $$;
