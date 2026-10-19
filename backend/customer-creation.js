const { safeText, validateEmail, validatePhone } = require('./security-utils');
const { notePlan } = require('./followup-workflow');

const PROFILE_FIELDS = ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'preferred_contact_method'];
const FOLLOWUP_TAGS = require('../frontend/shared/crm-status-tags').values;

function customerCreationPlan(input = {}, lead, now = new Date()) {
  const profile = {};
  for (const key of PROFILE_FIELDS) profile[key] = safeText(input[key] ?? lead[key] ?? '', key === 'full_name' ? 120 : 240);
  profile.whatsapp_number ||= profile.phone;
  profile.preferred_contact_method ||= 'Phone call';
  if (!profile.full_name || !profile.phone) throw new Error('Full name and phone are required.');
  if (!validatePhone(profile.phone) || !validatePhone(profile.whatsapp_number) || (profile.email && !validateEmail(profile.email))) throw new Error('Enter a valid phone number, WhatsApp number and email address.');
  if (input.tags !== undefined && !Array.isArray(input.tags)) throw new Error('Choose valid customer tags.');
  const inheritedTags = Array.isArray(lead.tags) ? lead.tags : [];
  profile.tags = [...new Set((input.tags ?? inheritedTags).map(tag => safeText(tag, 40)).filter(Boolean))].slice(0, 12);
  const enabled = input.schedule_followup === true || input.schedule_followup === 'true' || input.schedule_followup === 'on';
  if (!enabled) return { profile, note: '', schedule: null, tag: '' };
  const note = safeText(input.note, 2000);
  if (!note) throw new Error('Add a note for the follow-up.');
  const selected = input.followup_tags ?? input.followup_tag;
  if (!(Array.isArray(selected) ? selected.length && selected.every(tag => FOLLOWUP_TAGS.includes(tag)) : FOLLOWUP_TAGS.includes(selected))) throw new Error('Choose existing CRM status tags.');
  if (!lead.assigned_agent_id) throw new Error('Assign this lead to an advisor before scheduling a follow-up.');
  const { schedule, tag, tags } = notePlan({ ...input, customer_contacted: false, next_followup_days: 'custom' }, now);
  profile.tags = require('../frontend/shared/crm-status-tags').withStatus(profile.tags, tags);
  return { profile, note, schedule, tag, tags };
}

module.exports = { customerCreationPlan };
