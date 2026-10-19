const crypto = require('node:crypto');
const dates = require('../frontend/features/follow-ups/utils/followup-overdue-utils');
const { notePlan, activitySummary } = require('./followup-workflow');

function createMemoryFollowUpWorkflow({ leads, customers, followUps, users, notifications, customerNotes, addLeadActivity, addCustomerActivity, addFollowUpActivity, canViewFollowUp }) {
  function touch(leadId, customerId, userId, type, description) {
    const customer = customers.find(item => item.id === customerId || (leadId && item.lead_id === leadId));
    const lead = leads.find(item => item.id === (leadId || customer?.lead_id));
    const summary = activitySummary(type, description, users.find(item => item.id === userId) || { id: userId });
    for (const record of [lead, customer].filter(Boolean)) Object.assign(record, summary, { updated_at: summary.last_activity_at });
  }

  function refresh(leadId, customerId) {
    const customer = customers.find(item => item.id === customerId || (leadId && item.lead_id === leadId));
    const lead = leads.find(item => item.id === (leadId || customer?.lead_id));
    const items = followUps.filter(item => ((customer && item.customer_id === customer.id) || (lead && item.lead_id === lead.id)) && !['Completed','Cancelled','Missed'].includes(item.status));
    items.sort((a,b) => dates.toInstant(a.due_date,a.due_time)-dates.toInstant(b.due_date,b.due_time));
    const next = items[0] ? `${items[0].due_date}T${items[0].due_time}:00+05:00` : null;
    for (const record of [lead,customer].filter(Boolean)) record.next_follow_up_at = next;
  }

  function clearNotifications(ids) {
    for (const list of notifications.values()) for (const item of list) if (ids.includes(item.related_entity_id) && item.event_type === 'follow_up_overdue') item.is_read = true;
  }

  function saveNote(user, { leadId, customerId, followUpId, note, input = {} }) {
    const plan = notePlan(input);
    const customer = customers.find(item => item.id === customerId || (leadId && item.lead_id === leadId));
    const lead = leads.find(item => item.id === (leadId || customer?.lead_id));
    const related = followUps.filter(item => ((customer && item.customer_id === customer.id) || (lead && item.lead_id === lead.id)) && canViewFollowUp(user,item));
    const noteOnly = Boolean(followUpId && !plan.contacted && !plan.schedule);
    const candidates = related.filter(item => (!followUpId || item.id === followUpId) && (noteOnly || !['Completed','Cancelled'].includes(item.status) || (plan.contacted && plan.schedule && !item.consolidated_into)) && (noteOnly || plan.contacted || (plan.schedule && dates.isFollowUpOverdue(item))));
    candidates.sort((a,b) => { const closed=item=>['Completed','Cancelled'].includes(item.status); if(closed(a)!==closed(b))return closed(a)?1:-1; return closed(a) ? String(b.updated_at||'').localeCompare(a.updated_at||'') : dates.toInstant(a.due_date,a.due_time)-dates.toInstant(b.due_date,b.due_time); });
    let target = candidates[0];
    if (plan.contacted && followUpId && !target) throw new Error('This follow-up is closed.');
    const entry = { id: crypto.randomUUID(), note, user_id:user.id, user_name:user.full_name, created_at:new Date().toISOString() };
    if (target) {
      if (plan.schedule) {
        target.reschedule_history = [...(target.reschedule_history || []), { fromDate:target.due_date,fromTime:target.due_time,toDate:plan.schedule.due_date,toTime:plan.schedule.due_time,reason:'Next contact scheduled after a note.',changedBy:user.id,createdAt:entry.created_at }];
        target.rescheduled_from_date=target.due_date;target.rescheduled_from_time=target.due_time;
        target.due_date=plan.schedule.due_date;target.due_time=plan.schedule.due_time;
        target.status='Rescheduled';target.completed_at=null;target.snoozed_until=plan.schedule.due_at;
      } else if (plan.contacted) { target.status='Completed';target.completed_at=entry.created_at; }
      target.notes=note;
    } else if (plan.contacted && plan.schedule) {
      target = { id:`followup_${crypto.randomUUID()}`, customer_id:customer?.id,lead_id:lead?.id,customer_name:customer?.full_name || lead?.full_name,customer_phone:customer?.phone || lead?.phone,assigned_agent_id:customer?.assigned_agent_id || lead?.assigned_agent_id || user.id,assigned_agent:customer?.assigned_agent || lead?.assigned_agent || user.full_name,assigned_team_id:customer?.assigned_team_id || lead?.assigned_team_id || user.team_id,created_by:user.id,follow_up_type:'General Follow-up',due_date:plan.schedule.due_date,due_time:plan.schedule.due_time,status:'Rescheduled',priority:'Medium',notes:note,created_at:entry.created_at };
      followUps.unshift(target);
    }
    if (!plan.contacted && plan.schedule && target) delete target.outcome;
    if (plan.tag) {
      for (const record of [lead, customer, target].filter(Boolean)) {
        record.followup_tag = plan.tag;
        if (record !== target) record.tags = [...new Set([...(Array.isArray(record.tags) ? record.tags : []), plan.tag])];
      }
    }
    if (plan.contacted) {
      for (const record of [lead,customer].filter(Boolean)) record.last_contacted_at=entry.created_at;
      if (target) { target.outcome='Contacted';target.contacted_at=entry.created_at; }
    }
    if (target && (plan.contacted || plan.schedule)) {
      for (const item of related) if (item !== target && !['Completed','Cancelled'].includes(item.status)) {
        item.status='Cancelled';item.consolidated_into=target?.id;item.consolidation_reason='Combined into the customer follow-up.';
        addFollowUpActivity(item,user.id,'Follow-up combined',item.consolidation_reason);
      }
    }
    if (customer && (customerId || followUpId)) customerNotes.set(customer.id,[entry,...(customerNotes.get(customer.id)||[])]);
    const type=plan.contacted ? 'Customer contacted' : 'Note added';
    if (target) { target.updated_at=entry.created_at;Object.assign(target,activitySummary(type,note,user));addFollowUpActivity(target,user.id,type,note); }
    else { if (lead) addLeadActivity(lead.id,user.id,type,note); if (customer) addCustomerActivity(customer.id,user.id,type,note); }
    touch(lead?.id,customer?.id,user.id,type,note);
    if (plan.contacted || plan.schedule) clearNotifications(target ? [target.id,...related.filter(item=>item.consolidated_into===target.id).map(item=>item.id)] : []);
    refresh(lead?.id,customer?.id);
    return { entry, target };
  }
  return { touch, refresh, saveNote, clearNotifications };
}

module.exports = { createMemoryFollowUpWorkflow };
