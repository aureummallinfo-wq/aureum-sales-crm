const { safeText, validateEmail, validatePhone } = require('./security-utils');
const { notePlan } = require('./followup-workflow');

const PROFILE_FIELDS = ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'preferred_contact_method'];
const FOLLOWUP_TAGS = ['High Intent', 'VIP', 'Investor', 'Family Buyer', 'Retail VIP', 'Follow-up Needed'];

function customerCreationPlan(input = {}, lead, now = new Date()) {
  const profile = {};
  for (const key of PROFILE_FIELDS) profile[key] = safeText(input[key] ?? lead[key] ?? '', key === 'full_name' ? 120 : 240);
  profile.whatsapp_number ||= profile.phone;
  profile.preferred_contact_method ||= 'Phone call';
  if (!profile.full_name || !profile.phone) throw new Error('Full name and phone are required.');
  if (!validatePhone(profile.phone) || !validatePhone(profile.whatsapp_number) || (profile.email && !validateEmail(profile.email))) throw new Error('Enter a valid phone number, WhatsApp number and email address.');
  if (input.tags !== undefined && !Array.isArray(input.tags)) throw new Error('Choose valid customer tags.');
  const inheritedTags = Array.isArray(lead.tags) ? lead.tags : [];
  profile.tags = [...new Set((input.tags ?? inheritedTags).map(tag => safeText(tag, 40)).filter(Boolean))].slice(0, 10);
  const enabled = input.schedule_followup === true || input.schedule_followup === 'true' || input.schedule_followup === 'on';
  if (!enabled) return { profile, note: '', schedule: null, tag: '' };
  const note = safeText(input.note, 2000);
  if (!note) throw new Error('Add a note for the follow-up.');
  if (!FOLLOWUP_TAGS.includes(input.followup_tag)) throw new Error('Choose an existing follow-up tag.');
  if (!lead.assigned_agent_id) throw new Error('Assign this lead to an advisor before scheduling a follow-up.');
  const { schedule, tag } = notePlan({ ...input, customer_contacted: false, next_followup_days: 'custom' }, now);
  profile.tags = [...new Set([...profile.tags, tag])];
  return { profile, note, schedule, tag };
}

module.exports = { customerCreationPlan };
