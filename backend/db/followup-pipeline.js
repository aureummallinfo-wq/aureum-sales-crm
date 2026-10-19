const crypto = require('node:crypto');
const { activitySummary } = require('../followup-workflow');
const statusTags = require('../../frontend/shared/crm-status-tags');

function createFollowUpPipeline(sql, resolveUserId, resolveTeamId) {
  async function recordActivity(workspace, actor, { leadId = null, customerId = null, type, description, metadata = {} }) {
    const actorId = await resolveUserId(workspace, actor.id);
    const summary = activitySummary(type, description, actor);
    const rows = await sql.query(`WITH related_customer AS (
        SELECT id, lead_id FROM crm.customers WHERE workspace_id=$1 AND deleted_at IS NULL
        AND (id=$3::uuid OR lead_id=$2::uuid)
      ), related_lead AS (
        SELECT id FROM crm.leads WHERE workspace_id=$1 AND deleted_at IS NULL
        AND (id=$2::uuid OR id IN (SELECT lead_id FROM related_customer))
      ), lead_activity AS (
        INSERT INTO crm.lead_activities (lead_id,actor_user_id,activity_type,description,metadata)
        SELECT id,$4,$5,$6,$7::jsonb FROM related_lead RETURNING *
      ), customer_activity AS (
        INSERT INTO crm.customer_activities (customer_id,actor_user_id,activity_type,description,metadata)
        SELECT id,$4,$5,$6,$7::jsonb FROM related_customer RETURNING *
      ), touch_lead AS (
        UPDATE crm.leads SET metadata=metadata || $8::jsonb,updated_at=now()
        WHERE id IN (SELECT id FROM related_lead)
      ), touch_customer AS (
        UPDATE crm.customers SET metadata=metadata || $8::jsonb,updated_at=now()
        WHERE id IN (SELECT id FROM related_customer)
      ) SELECT id,activity_type,description,created_at FROM lead_activity
      UNION ALL SELECT id,activity_type,description,created_at FROM customer_activity`,
    [workspace, leadId, customerId, actorId, type, description, JSON.stringify(metadata), JSON.stringify(summary)]);
    return rows[0] || null;
  }

  async function refreshNextAction(workspace, leadId = null, customerId = null) {
    await sql.query(`WITH related AS (
        SELECT c.id AS customer_id,c.lead_id FROM crm.customers c
        WHERE c.workspace_id=$1 AND c.deleted_at IS NULL AND (c.id=$3::uuid OR c.lead_id=$2::uuid)
      ), next_action AS (
        SELECT min(due_at) AS due_at FROM crm.follow_ups WHERE workspace_id=$1 AND deleted_at IS NULL
        AND status IN ('Pending','Overdue','Rescheduled')
        AND (lead_id=$2::uuid OR customer_id=$3::uuid OR customer_id IN (SELECT customer_id FROM related) OR lead_id IN (SELECT lead_id FROM related))
      ), touch_lead AS (
        UPDATE crm.leads SET next_follow_up_at=(SELECT due_at FROM next_action)
        WHERE workspace_id=$1 AND (id=$2::uuid OR id IN (SELECT lead_id FROM related))
      ) UPDATE crm.customers SET metadata=metadata || jsonb_build_object('next_follow_up_at',(SELECT due_at FROM next_action))
      WHERE id IN (SELECT customer_id FROM related)`, [workspace, leadId, customerId]);
  }

  async function saveNote(workspace, actor, { leadId = null, customerId = null, followUpId = null, note, plan }) {
    const actorId = await resolveUserId(workspace, actor.id);
    const teamId = await resolveTeamId(workspace, actor.team_id);
    const noteId = crypto.randomUUID();
    const type = plan.contacted ? 'Customer contacted' : 'Note added';
    const summary = { ...activitySummary(type, note, actor), ...(plan.tag ? { followup_tag: plan.tag, followup_tags: plan.tags } : {}) };
    const schedule = plan.schedule;
    // Replace the previous status tag while retaining unrelated historical labels.
    const tagMetadata = `CASE WHEN $17::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('tags',
      coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(metadata->'tags')='array' THEN metadata->'tags' ELSE '[]'::jsonb END)
        WHERE NOT ($19::jsonb ? (value #>> '{}'))),'[]'::jsonb) || $18::jsonb) END`;
    const result = await sql.query(`WITH context AS (
        SELECT l.id AS lead_id,c.id AS customer_id,
          coalesce(c.assigned_agent_id,l.assigned_agent_id,$4::uuid) AS agent_id,
          coalesce(c.assigned_team_id,l.assigned_team_id,$5::uuid) AS team_id
        FROM crm.leads l LEFT JOIN crm.customers c ON c.lead_id=l.id AND c.workspace_id=l.workspace_id AND c.deleted_at IS NULL
        WHERE l.workspace_id=$1 AND l.deleted_at IS NULL AND (l.id=$2::uuid OR c.id=$3::uuid)
          AND ($6='super_admin' OR ($6='sales_manager' AND coalesce(c.assigned_team_id,l.assigned_team_id)=$5::uuid)
            OR ($6='sales_agent' AND coalesce(c.assigned_agent_id,l.assigned_agent_id)=$4::uuid))
      ), lead_note AS (
        INSERT INTO crm.lead_notes (id,lead_id,author_user_id,note)
        SELECT $14,id,$4,$7 FROM crm.leads WHERE id IN (SELECT lead_id FROM context) AND $3::uuid IS NULL
        RETURNING id,created_at
      ), customer_note AS (
        INSERT INTO crm.customer_notes (id,customer_id,author_user_id,note)
        SELECT $14,customer_id,$4,$7 FROM context WHERE $3::uuid IS NOT NULL RETURNING id,created_at
      ), candidate AS (
        SELECT f.* FROM crm.follow_ups f JOIN context c ON (f.lead_id=c.lead_id OR f.customer_id=c.customer_id)
        WHERE f.workspace_id=$1 AND f.deleted_at IS NULL AND f.assigned_agent_id=c.agent_id
          AND f.assigned_team_id IS NOT DISTINCT FROM c.team_id AND (f.customer_id IS NULL OR f.customer_id=c.customer_id) AND (f.lead_id IS NULL OR f.lead_id=c.lead_id) AND (f.status IN ('Pending','Overdue','Rescheduled','Missed') OR ($13::uuid IS NOT NULL AND NOT $8 AND $9::timestamptz IS NULL) OR ($8 AND $9::timestamptz IS NOT NULL AND f.status IN ('Completed','Cancelled') AND f.metadata->>'consolidated_into' IS NULL))
          AND ($13::uuid IS NULL OR f.id=$13::uuid)
          AND ($8::boolean OR ($13::uuid IS NOT NULL AND $9::timestamptz IS NULL) OR (f.status IN ('Pending','Overdue','Rescheduled') AND f.due_at<=now() AND $9::timestamptz IS NOT NULL))
          AND ($6='super_admin' OR ($6='sales_manager' AND f.assigned_team_id=$5::uuid) OR f.assigned_agent_id=$4::uuid)
        ORDER BY CASE WHEN f.status IN ('Completed','Cancelled') THEN 1 ELSE 0 END, CASE WHEN f.status NOT IN ('Completed','Cancelled') THEN f.due_at END, f.updated_at DESC,f.id LIMIT 1 FOR UPDATE OF f
      ), changed AS (
        UPDATE crm.follow_ups f SET status=CASE WHEN $8 AND $9::timestamptz IS NULL THEN 'Completed' WHEN $9::timestamptz IS NOT NULL THEN 'Rescheduled' ELSE f.status END,
          completed_at=CASE WHEN $8 AND $9::timestamptz IS NULL THEN now() WHEN $9::timestamptz IS NOT NULL THEN NULL ELSE f.completed_at END,
          due_at=coalesce($9::timestamptz,f.due_at),
          notes=$7,updated_at=now(),metadata=(CASE WHEN NOT $8 AND $9::timestamptz IS NOT NULL THEN f.metadata-'outcome' ELSE f.metadata END) || $12::jsonb || CASE WHEN $8 THEN
            jsonb_build_object('outcome','Contacted','contacted_at',now(),'completion_note',$7::text) ELSE '{}'::jsonb END || CASE WHEN $9::timestamptz IS NOT NULL THEN jsonb_build_object('due_date',$10::text,'due_time',$11::text,'snoozed_until',$9::text,
            'rescheduled_from_date',to_char(f.due_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),
            'rescheduled_from_time',to_char(f.due_at AT TIME ZONE 'Asia/Karachi','HH24:MI'),
            'reschedule_reason','Next contact scheduled after a note.',
            'reschedule_history',coalesce(f.metadata->'reschedule_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
              'fromDate',to_char(f.due_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),
              'fromTime',to_char(f.due_at AT TIME ZONE 'Asia/Karachi','HH24:MI'),
              'toDate',$10::text,'toTime',$11::text,'reason','Next contact scheduled after a note.','changedBy',$4::text,'createdAt',now()))) ELSE '{}'::jsonb END
        WHERE f.id IN (SELECT id FROM candidate) RETURNING f.id,f.status
      ), next_followup AS (
        INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,priority,status,notes,metadata,created_by)
        SELECT $1,coalesce('followup_customer_' || c.customer_id::text,'followup_lead_' || c.lead_id::text,$15::text),c.lead_id,c.customer_id,coalesce(old.assigned_agent_id,c.agent_id),coalesce(old.assigned_team_id,c.team_id),
          coalesce(old.follow_up_type,'General Follow-up'),$9::timestamptz,coalesce(old.priority,'Medium'),'Rescheduled',$7,
          jsonb_build_object('due_date',$10::text,'due_time',$11::text,'source','contact-note','outcome','Contacted','contacted_at',now(),'note_id',$14::text) || $12::jsonb,$4
        FROM context c LEFT JOIN candidate old ON true WHERE $8 AND $9::timestamptz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM changed)
        ON CONFLICT (workspace_id,legacy_id) DO UPDATE SET due_at=EXCLUDED.due_at,status=EXCLUDED.status,completed_at=NULL,deleted_at=NULL,
          assigned_agent_id=EXCLUDED.assigned_agent_id,assigned_team_id=EXCLUDED.assigned_team_id,
          notes=EXCLUDED.notes,updated_at=now(),metadata=crm.follow_ups.metadata || EXCLUDED.metadata || jsonb_build_object('reschedule_history',
            coalesce(crm.follow_ups.metadata->'reschedule_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
              'fromDate',to_char(crm.follow_ups.due_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),
              'fromTime',to_char(crm.follow_ups.due_at AT TIME ZONE 'Asia/Karachi','HH24:MI'),
              'toDate',$10::text,'toTime',$11::text,'reason','Next contact scheduled after a note.','changedBy',$4::text,'createdAt',now())))
        RETURNING id,legacy_id
      ), consolidated AS (
        UPDATE crm.follow_ups f SET status='Cancelled',updated_at=now(),metadata=f.metadata || jsonb_build_object('consolidated_into',(SELECT id::text FROM changed),'consolidation_reason','Combined into the customer follow-up.','consolidated_from_status',f.status)
        FROM context c WHERE EXISTS (SELECT 1 FROM changed) AND ($8 OR $9::timestamptz IS NOT NULL) AND f.workspace_id=$1 AND f.deleted_at IS NULL
          AND f.assigned_agent_id=c.agent_id AND f.assigned_team_id IS NOT DISTINCT FROM c.team_id
          AND (f.customer_id IS NULL OR f.customer_id=c.customer_id) AND (f.lead_id IS NULL OR f.lead_id=c.lead_id)
          AND (f.lead_id=c.lead_id OR f.customer_id=c.customer_id) AND f.id NOT IN (SELECT id FROM changed)
          AND f.status IN ('Pending','Overdue','Rescheduled','Missed')
          AND ($6='super_admin' OR ($6='sales_manager' AND f.assigned_team_id=$5::uuid) OR f.assigned_agent_id=$4::uuid)
        RETURNING f.id,f.metadata
      ), consolidated_history AS (
        INSERT INTO crm.follow_up_status_history (follow_up_id,from_status,to_status,changed_by)
        SELECT id,metadata->>'consolidated_from_status','Cancelled',$4 FROM consolidated
      ), consolidated_activity AS (
        INSERT INTO crm.follow_up_activities (follow_up_id,actor_user_id,activity_type,description)
        SELECT id,$4,'Follow-up combined','Combined into the customer follow-up.' FROM consolidated
      ), history AS (
        INSERT INTO crm.follow_up_status_history (follow_up_id,from_status,to_status,changed_by)
        SELECT changed.id,candidate.status,changed.status,$4 FROM changed JOIN candidate USING(id) WHERE changed.status<>candidate.status
      ), followup_activity AS (
        INSERT INTO crm.follow_up_activities (follow_up_id,actor_user_id,activity_type,description,metadata)
        SELECT id,$4,$16,$7,$12::jsonb FROM changed
        UNION ALL SELECT id,$4,$16,$7,$12::jsonb FROM next_followup
      ), lead_activity AS (
        INSERT INTO crm.lead_activities (lead_id,actor_user_id,activity_type,description,metadata)
        SELECT lead_id,$4,$16,$7,$12::jsonb FROM context
      ), customer_activity AS (
        INSERT INTO crm.customer_activities (customer_id,actor_user_id,activity_type,description,metadata)
        SELECT customer_id,$4,$16,$7,$12::jsonb FROM context WHERE customer_id IS NOT NULL
      ), touch_lead AS (
        UPDATE crm.leads SET metadata=metadata || $12::jsonb || ${tagMetadata},
          last_contacted_at=CASE WHEN $8 THEN now() ELSE last_contacted_at END,updated_at=now()
        WHERE id IN (SELECT lead_id FROM context)
      ), touch_customer AS (
        UPDATE crm.customers SET metadata=metadata || $12::jsonb || ${tagMetadata} || CASE WHEN $8 THEN jsonb_build_object('last_contacted_at',now()) ELSE '{}'::jsonb END,
          updated_at=now()
        WHERE id IN (SELECT customer_id FROM context)
      ), audit AS (
        INSERT INTO crm.audit_events (workspace_id,actor_user_id,action,entity_type,entity_id,after_data)
        SELECT $1,$4,CASE WHEN $8 THEN 'customer_contacted' ELSE 'note_added' END,
          CASE WHEN customer_id IS NOT NULL THEN 'customer' ELSE 'lead' END,coalesce(customer_id,lead_id),
          jsonb_build_object('note_id',$14::text,'next_contact_at',$9::text,'customer_contacted',$8::boolean) FROM context
      ), outbox AS (
        INSERT INTO crm.outbox_events (workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key)
        SELECT $1,CASE WHEN $8 THEN 'customer_contacted' ELSE 'note_added' END,
          CASE WHEN customer_id IS NOT NULL THEN 'customer' ELSE 'lead' END,coalesce(customer_id,lead_id),
          jsonb_build_object('note_id',$14::text,'next_contact_at',$9::text,'customer_contacted',$8::boolean),'note:' || $14::text FROM context
      ), clear_notifications AS (
        UPDATE crm.notifications SET is_read=true WHERE ($8 OR $9::timestamptz IS NOT NULL) AND event_key='follow_up_overdue' AND related_entity_id IN (SELECT id FROM changed UNION ALL SELECT id FROM consolidated)
      ) SELECT $14::text AS id,$7::text AS note,now() AS created_at,
        coalesce((SELECT legacy_id FROM next_followup),(SELECT legacy_id FROM candidate)) AS next_follow_up_id,
        (SELECT count(*)::integer FROM changed) AS affected_followups`,
    [workspace,leadId,customerId,actorId,teamId,actor.role,note,plan.contacted,schedule?.due_at || null,schedule?.due_date || null,schedule?.due_time || null,
      JSON.stringify(summary),followUpId,noteId,`followup_${crypto.randomUUID()}`,type,plan.tag || null,JSON.stringify(plan.tags || []),JSON.stringify(statusTags.values)]);
    await refreshNextAction(workspace, leadId, customerId);
    return { ...result[0], user_id: actor.id, user_name: actor.full_name, customer_contacted: plan.contacted };
  }

  async function consolidate(workspace, actor, followUpId) {
    const actorId = await resolveUserId(workspace,actor.id);
    const teamId = await resolveTeamId(workspace,actor.team_id);
    await sql.query(`WITH target AS (
        SELECT * FROM crm.follow_ups WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL
          AND ($3='super_admin' OR ($3='sales_manager' AND assigned_team_id=$4::uuid) OR ($3='sales_agent' AND assigned_agent_id=$5::uuid))
      ), duplicates AS (
        UPDATE crm.follow_ups f SET status='Cancelled',updated_at=now(),metadata=f.metadata || jsonb_build_object(
          'consolidated_into',t.id::text,'consolidation_reason','Combined into the customer follow-up.','consolidated_from_status',f.status)
        FROM target t WHERE f.workspace_id=t.workspace_id AND f.deleted_at IS NULL AND f.id<>t.id
          AND f.assigned_agent_id=t.assigned_agent_id AND f.assigned_team_id IS NOT DISTINCT FROM t.assigned_team_id
          AND (f.customer_id=t.customer_id OR (f.customer_id IS NULL AND f.lead_id=t.lead_id))
          AND (f.lead_id IS NULL OR f.lead_id=t.lead_id) AND f.status IN ('Pending','Overdue','Rescheduled','Missed')
        RETURNING f.id,f.metadata
      ), history AS (
        INSERT INTO crm.follow_up_status_history (follow_up_id,from_status,to_status,changed_by)
        SELECT id,metadata->>'consolidated_from_status','Cancelled',$5 FROM duplicates
      ), activity AS (
        INSERT INTO crm.follow_up_activities (follow_up_id,actor_user_id,activity_type,description)
        SELECT id,$5,'Follow-up combined','Combined into the customer follow-up.' FROM duplicates
      ) UPDATE crm.notifications SET is_read=true WHERE event_key='follow_up_overdue' AND related_entity_id IN (SELECT id FROM duplicates)`,
    [workspace,followUpId,actor.role,teamId,actorId]);
  }

  return { recordActivity, saveNote, refreshNextAction, consolidate };
}

module.exports = { createFollowUpPipeline };
