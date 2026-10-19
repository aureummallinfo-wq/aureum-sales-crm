const statusTags = require('../../frontend/shared/crm-status-tags');
const crypto = require('node:crypto');
const { activitySummary } = require('../followup-workflow');

// One statement keeps customer creation, the optional reminder, and history atomic.
async function insertLeadCustomer(sql, { workspace, lead, leadId, actor, actorId, teamId, plan }) {
  const { profile, note, schedule, tag, tags } = plan;
  const type = schedule ? 'Follow-up scheduled' : 'Customer profile created';
  const description = schedule ? note : `Customer profile created from ${lead.full_name}`;
  const summary = activitySummary(type, description, actor);
  const metadata = { ...lead, ...profile, ...summary, lead_id: lead.id,
    ...(schedule ? { next_follow_up_at: schedule.due_at, followup_tag: tag, followup_tags: tags } : {}) };
  const reminderMetadata = { ...summary, due_date: schedule?.due_date, due_time: schedule?.due_time, followup_tag: tag, followup_tags: tags, source: 'customer-creation' };
  const rows = await sql.query(`WITH permitted_lead AS (
      SELECT * FROM crm.leads WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL
        AND ($3='super_admin' OR ($3='sales_manager' AND assigned_team_id=$4::uuid)
          OR ($3='sales_agent' AND assigned_agent_id=$5::uuid))
    ), new_customer AS (
      INSERT INTO crm.customers (workspace_id,legacy_id,lead_id,full_name,phone,whatsapp_number,email,
        customer_status,assigned_agent_id,assigned_team_id,created_by,metadata)
      SELECT $1,$6,id,$7,$8,$9,$10,$11,assigned_agent_id,assigned_team_id,$5,$12::jsonb FROM permitted_lead
      ON CONFLICT (lead_id) DO NOTHING RETURNING *
    ), existing_reminder AS (
      SELECT f.id FROM crm.follow_ups f JOIN new_customer c ON f.lead_id=c.lead_id
      WHERE f.workspace_id=$1 AND f.deleted_at IS NULL AND f.customer_id IS NULL
        AND f.assigned_agent_id=c.assigned_agent_id AND f.assigned_team_id IS NOT DISTINCT FROM c.assigned_team_id
        AND f.metadata->>'consolidated_into' IS NULL AND $14::timestamptz IS NOT NULL
      ORDER BY CASE WHEN f.status IN ('Completed','Cancelled') THEN 1 ELSE 0 END,f.due_at,f.created_at LIMIT 1
    ), reused_reminder AS (
      UPDATE crm.follow_ups f SET customer_id=c.id,due_at=$14::timestamptz,status='Rescheduled',completed_at=NULL,
        notes=$16,updated_at=now(),metadata=f.metadata || $17::jsonb || jsonb_build_object('reschedule_history',
          coalesce(f.metadata->'reschedule_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'fromDate',to_char(f.due_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),
            'fromTime',to_char(f.due_at AT TIME ZONE 'Asia/Karachi','HH24:MI'),
            'toDate',$17::jsonb->>'due_date','toTime',$17::jsonb->>'due_time','reason','Schedule updated.','createdAt',now())))
      FROM new_customer c WHERE f.id IN (SELECT id FROM existing_reminder) RETURNING f.id,f.legacy_id
    ), inserted_reminder AS (
      INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,
        follow_up_type,due_at,priority,status,notes,metadata,created_by)
      SELECT $1,coalesce('followup_customer_' || id::text,$13::text),lead_id,id,assigned_agent_id,assigned_team_id,'General Follow-up',$14::timestamptz,$15,'Pending',$16,$17::jsonb,$5
      FROM new_customer WHERE $14::timestamptz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reused_reminder)
      RETURNING id,legacy_id
    ), reminder AS (
      SELECT * FROM reused_reminder UNION ALL SELECT * FROM inserted_reminder
    ), customer_note AS (
      INSERT INTO crm.customer_notes (customer_id,author_user_id,note)
      SELECT id,$5,$16 FROM new_customer WHERE $14::timestamptz IS NOT NULL
    ), customer_activity AS (
      INSERT INTO crm.customer_activities (customer_id,actor_user_id,activity_type,description)
      SELECT id,$5,'Customer profile created',$18 FROM new_customer
      UNION ALL SELECT id,$5,'Follow-up scheduled',$16 FROM new_customer WHERE $14::timestamptz IS NOT NULL
    ), lead_activity AS (
      INSERT INTO crm.lead_activities (lead_id,actor_user_id,activity_type,description)
      SELECT lead_id,$5,'Customer profile created',$18 FROM new_customer
      UNION ALL SELECT lead_id,$5,'Follow-up scheduled',$16 FROM new_customer WHERE $14::timestamptz IS NOT NULL
    ), reminder_activity AS (
      INSERT INTO crm.follow_up_activities (follow_up_id,actor_user_id,activity_type,description)
      SELECT id,$5,'Follow-up scheduled',$16 FROM reminder
    ), touch_lead AS (
      UPDATE crm.leads SET next_follow_up_at=coalesce($14::timestamptz,next_follow_up_at),
        metadata=metadata || $19::jsonb || CASE WHEN $20::text IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object('tags',coalesce(($12::jsonb)->'tags','[]'::jsonb)) END,
        updated_at=now() WHERE id IN (SELECT lead_id FROM new_customer)
    ), audit AS (
      INSERT INTO crm.audit_events (workspace_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT $1,$5,'lead_converted','lead',lead_id,jsonb_build_object('customer_legacy_id',legacy_id) FROM new_customer
    ), outbox AS (
      INSERT INTO crm.outbox_events (workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key)
      SELECT $1,'customer_created','customer',id,jsonb_build_object('legacy_id',legacy_id),'customer:' || id::text FROM new_customer
      UNION ALL SELECT $1,'follow_up_created','follow_up',id,jsonb_build_object('legacy_id',legacy_id),'followup:' || id::text FROM reminder
    ) SELECT legacy_id AS customer_id,(SELECT legacy_id FROM reminder) AS follow_up_id FROM new_customer`,
  [workspace, leadId, actor.role, teamId, actorId, `customer_${crypto.randomUUID()}`, profile.full_name, profile.phone,
    profile.whatsapp_number || null, profile.email || null,
    statusTags.normalize(lead.status), JSON.stringify(metadata),
    `followup_${crypto.randomUUID()}`, schedule?.due_at || null, lead.priority || 'Medium', note,
    JSON.stringify(reminderMetadata), `Customer profile created from ${lead.full_name}`, JSON.stringify(summary), tag || null]);
  return rows[0] || null;
}

module.exports = { insertLeadCustomer };
