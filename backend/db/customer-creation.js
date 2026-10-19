const crypto = require('node:crypto');
const { activitySummary } = require('../followup-workflow');

// One statement keeps customer creation, the optional reminder, and history atomic.
async function insertLeadCustomer(sql, { workspace, lead, leadId, actor, actorId, teamId, plan }) {
  const { profile, note, schedule, tag } = plan;
  const type = schedule ? 'Follow-up scheduled' : 'Customer profile created';
  const description = schedule ? note : `Customer profile created from ${lead.full_name}`;
  const summary = activitySummary(type, description, actor);
  const metadata = { ...lead, ...profile, ...summary, lead_id: lead.id,
    ...(schedule ? { next_follow_up_at: schedule.due_at, followup_tag: tag } : {}) };
  const reminderMetadata = { ...summary, due_date: schedule?.due_date, due_time: schedule?.due_time, followup_tag: tag, source: 'customer-creation' };
  const rows = await sql.query(`WITH permitted_lead AS (
      SELECT * FROM crm.leads WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL
        AND ($3='super_admin' OR ($3='sales_manager' AND assigned_team_id=$4::uuid)
          OR ($3='sales_agent' AND assigned_agent_id=$5::uuid))
    ), new_customer AS (
      INSERT INTO crm.customers (workspace_id,legacy_id,lead_id,full_name,phone,whatsapp_number,email,
        customer_status,assigned_agent_id,assigned_team_id,created_by,metadata)
      SELECT $1,$6,id,$7,$8,$9,$10,$11,assigned_agent_id,assigned_team_id,$5,$12::jsonb FROM permitted_lead
      ON CONFLICT (lead_id) DO NOTHING RETURNING *
    ), reminder AS (
      INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,
        follow_up_type,due_at,priority,status,notes,metadata,created_by)
      SELECT $1,$13,lead_id,id,assigned_agent_id,assigned_team_id,'General Follow-up',$14::timestamptz,$15,'Pending',$16,$17::jsonb,$5
      FROM new_customer WHERE $14::timestamptz IS NOT NULL RETURNING id,legacy_id
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
          ELSE jsonb_build_object('tags',
            (CASE WHEN jsonb_typeof(metadata->'tags')='array' THEN metadata->'tags' ELSE '[]'::jsonb END)
            || CASE WHEN coalesce(metadata->'tags','[]'::jsonb) ? $20::text THEN '[]'::jsonb ELSE jsonb_build_array($20::text) END) END,
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
    ['Closed Won', 'Hot', 'Follow-up'].includes(lead.status) ? lead.status : 'Active', JSON.stringify(metadata),
    `followup_${crypto.randomUUID()}`, schedule?.due_at || null, lead.priority || 'Medium', note,
    JSON.stringify(reminderMetadata), `Customer profile created from ${lead.full_name}`, JSON.stringify(summary), tag || null]);
  return rows[0] || null;
}

module.exports = { insertLeadCustomer };
