const dates = require('../frontend/features/follow-ups/utils/followup-overdue-utils');

function notePlan(input = {}, now = new Date()) {
  const contacted = input.customer_contacted === true || input.customer_contacted === 'true';
  const tag = input.followup_tag == null ? '' : String(input.followup_tag).trim();
  if (tag && (typeof input.followup_tag !== 'string' || tag.length > 40 || /[<>\x00-\x1f]/.test(tag))) throw new Error('Choose a valid follow-up tag.');
  const details = { contacted, ...(tag ? { tag } : {}) };
  const choice = String(input.next_followup_days ?? '2');
  if (choice === 'none') return { ...details, schedule: null };
  if (choice === 'custom') {
    const instant = dates.toInstant(input.next_due_date, input.next_due_time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.next_due_date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.next_due_time || '') || !Number.isFinite(instant) || instant <= now.getTime()) throw new Error('Choose a future follow-up date and time.');
    const parts = dates.zonedNowParts(new Date(instant));
    if (`${parts.year}-${parts.month}-${parts.day}` !== input.next_due_date) throw new Error('Choose a valid follow-up date.');
    return { ...details, schedule: { due_date: input.next_due_date, due_time: input.next_due_time, due_at: new Date(instant).toISOString() } };
  }
  if (!['1', '2', '3', '5', '7', '10'].includes(choice)) throw new Error('Choose 1, 2, 3, 5, 7, or 10 days, a custom date, or no next follow-up.');
  const due = new Date(now.getTime() + Number(choice) * 86400000);
  due.setUTCSeconds(0, 0);
  const parts = dates.zonedNowParts(due);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = input.next_due_time || `${parts.hour}:${parts.minute}`;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid follow-up time.');
  return { ...details, schedule: { due_date: date, due_time: time, due_at: new Date(dates.toInstant(date,time)).toISOString() } };
}

function displayStatus(item, now = new Date()) {
  if (item.outcome === 'Contacted' && ['Completed','Rescheduled'].includes(item.status) && !dates.isFollowUpOverdue(item, now)) return 'Contacted';
  return dates.getComputedFollowUpStatus(item, now);
}

function activitySummary(type, description, actor, now = new Date()) {
  return { last_activity_at: now.toISOString(), last_activity_type: type, last_activity_description: description, last_activity_by: actor.full_name || actor.id, last_activity_user_id: actor.id };
}

function uniqueFollowUps(items) {
  const groups = new Map();
  const scopeKey = (item, id) => `${item.workspace_id || ''}:${id}`;
  const leadCustomers = new Map(items.filter(item=>item.lead_id && item.customer_id).map(item=>[scopeKey(item,item.lead_id),item.customer_id]));
  for (const item of items) {
    if (item.consolidated_into || item.metadata?.consolidated_into) continue;
    const customerId=item.customer_id || leadCustomers.get(scopeKey(item,item.lead_id));
    const key = scopeKey(item, customerId ? `customer:${customerId}` : item.lead_id ? `lead:${item.lead_id}` : `followup:${item.id}`);
    const current = groups.get(key);
    const open = value => !['Completed','Cancelled'].includes(value.lifecycle_status || value.status) && !value.completed_at;
    if (!current || (open(item) && !open(current)) || (open(item) === open(current) && (open(item) ? String(item.due_date || '') + String(item.due_time || '') < String(current.due_date || '') + String(current.due_time || '') : String(item.updated_at || '') > String(current.updated_at || '')))) groups.set(key,item);
  }
  return [...groups.values()];
}

function isCompletedFollowUp(item) { return (item.lifecycle_status || item.status) === 'Completed'; }

module.exports = { notePlan, displayStatus, activitySummary, uniqueFollowUps, isCompletedFollowUp };
