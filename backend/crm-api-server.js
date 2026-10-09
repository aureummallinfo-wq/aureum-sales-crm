const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 4173);
const ROOT = path.resolve(__dirname, '..');
const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();

const rolePermissions = {
  super_admin: ['dashboard', 'leads', 'my-leads', 'customers', 'follow-ups', 'team-chat', 'reports', 'agents', 'users', 'my-account', 'change-password', 'settings'],
  sales_manager: ['dashboard', 'leads', 'my-leads', 'add-lead', 'customers', 'follow-ups', 'team-chat', 'reports', 'agents', 'users', 'my-account', 'change-password'],
  sales_agent: ['dashboard', 'my-leads', 'customers', 'follow-ups', 'team-chat']
};

const dashboardByRole = {
  super_admin: {
    scopeLabel: 'Company-wide overview',
    summary: { totalLeads: 1248, newLeads: 320, hotLeads: 86, followUpsDue: 42, overdueFollowUps: 14, activeCustomers: 684, closedDeals: 48, conversionRate: 18.5, bookingVolume: 'PKR 385M' },
    leadInflow: [58, 72, 45, 66, 80, 55, 65, 75, 84, 100, 72, 88],
    leadSources: [{ name: 'Website', value: 35 }, { name: 'WhatsApp', value: 28 }, { name: 'Facebook', value: 18 }, { name: 'Sales Partners', value: 12 }, { name: 'Walk-in', value: 7 }],
    followUpPerformance: [{ name: 'Completed', value: 184 }, { name: 'Pending', value: 56 }, { name: 'Rescheduled', value: 28 }, { name: 'Overdue', value: 14 }],
    conversionOverview: [{ name: 'New leads', value: 1248 }, { name: 'Contacted', value: 892 }, { name: 'Qualified', value: 540 }, { name: 'Follow-up', value: 320 }, { name: 'Negotiation', value: 146 }, { name: 'Booking', value: 96 }, { name: 'Closed won', value: 48 }],
    agentPerformance: [{ name: 'Ali Raza', initials: 'AR', assigned: 180, completed: 120, closed: 12, conversion: '22.2%' }, { name: 'Hamza Khan', initials: 'HK', assigned: 160, completed: 104, closed: 9, conversion: '18.0%' }, { name: 'Sara Ahmed', initials: 'SA', assigned: 145, completed: 96, closed: 8, conversion: '19.0%' }, { name: 'Ayesha Noor', initials: 'AN', assigned: 132, completed: 88, closed: 6, conversion: '15.0%' }],
    recentLeads: [{ name: 'Ahmed Khan', initials: 'AK', source: 'Website', interest: '1 Bed Apartment', agent: 'Ali Raza', status: 'Hot', created: 'Today' }, { name: 'Sara Malik', initials: 'SM', source: 'WhatsApp', interest: 'Commercial Shop', agent: 'Hamza Khan', status: 'New', created: 'Today' }, { name: 'Usman Ali', initials: 'UA', source: 'Partner', interest: 'Corporate Office', agent: 'Sara Ahmed', status: 'Follow-up', created: 'Yesterday' }, { name: 'Fatima Ahmed', initials: 'FA', source: 'Facebook', interest: '2 Bed Apartment', agent: 'Ayesha Noor', status: 'Visit', created: 'Yesterday' }],
    todayFollowUps: [{ time: '10:00 AM', customer: 'Ahmed Khan', type: 'Phone call', agent: 'Ali Raza', status: 'Pending' }, { time: '12:30 PM', customer: 'Sara Malik', type: 'WhatsApp', agent: 'Hamza Khan', status: 'Pending' }, { time: '03:00 PM', customer: 'Usman Ali', type: 'Plan review', agent: 'Sara Ahmed', status: 'Overdue' }, { time: '05:00 PM', customer: 'Fatima Ahmed', type: 'Confirmation', agent: 'Ayesha Noor', status: 'Completed' }]
  },
  sales_manager: {
    scopeLabel: 'Sales Team A · Team overview',
    summary: { totalLeads: 486, newLeads: 118, hotLeads: 34, followUpsDue: 19, overdueFollowUps: 6, activeCustomers: 242, closedDeals: 18, conversionRate: 16.8, bookingVolume: 'PKR 146M' },
    leadInflow: [34, 46, 40, 52, 48, 61, 55, 63, 70, 76, 64, 82],
    leadSources: [{ name: 'Website', value: 38 }, { name: 'WhatsApp', value: 31 }, { name: 'Partners', value: 17 }, { name: 'Walk-in', value: 9 }, { name: 'Referral', value: 5 }],
    followUpPerformance: [{ name: 'Completed', value: 92 }, { name: 'Pending', value: 28 }, { name: 'Rescheduled', value: 14 }, { name: 'Overdue', value: 6 }],
    conversionOverview: [{ name: 'New leads', value: 486 }, { name: 'Contacted', value: 354 }, { name: 'Qualified', value: 214 }, { name: 'Follow-up', value: 132 }, { name: 'Negotiation', value: 62 }, { name: 'Booking', value: 36 }, { name: 'Closed won', value: 18 }],
    agentPerformance: [{ name: 'Ali Raza', initials: 'AR', assigned: 180, completed: 120, closed: 12, conversion: '22.2%' }, { name: 'Hamza Khan', initials: 'HK', assigned: 160, completed: 104, closed: 9, conversion: '18.0%' }, { name: 'Sara Ahmed', initials: 'SA', assigned: 146, completed: 92, closed: 7, conversion: '17.1%' }],
    recentLeads: [{ name: 'Ahmed Khan', initials: 'AK', source: 'Website', interest: '1 Bed Apartment', agent: 'Ali Raza', status: 'Hot', created: 'Today' }, { name: 'Sara Malik', initials: 'SM', source: 'WhatsApp', interest: 'Commercial Shop', agent: 'Hamza Khan', status: 'New', created: 'Today' }, { name: 'Usman Ali', initials: 'UA', source: 'Partner', interest: 'Corporate Office', agent: 'Sara Ahmed', status: 'Follow-up', created: 'Yesterday' }],
    todayFollowUps: [{ time: '10:00 AM', customer: 'Ahmed Khan', type: 'Phone call', agent: 'Ali Raza', status: 'Pending' }, { time: '12:30 PM', customer: 'Sara Malik', type: 'WhatsApp', agent: 'Hamza Khan', status: 'Pending' }, { time: '03:00 PM', customer: 'Usman Ali', type: 'Plan review', agent: 'Sara Ahmed', status: 'Overdue' }]
  },
  sales_agent: {
    scopeLabel: 'My workspace · Personal overview',
    summary: { totalLeads: 42, newLeads: 8, hotLeads: 6, followUpsDue: 5, overdueFollowUps: 2, activeCustomers: 26, closedDeals: 3, conversionRate: 12.5, bookingVolume: 'PKR 18M' },
    leadInflow: [18, 22, 14, 26, 30, 28, 34, 31, 38, 42, 36, 46],
    leadSources: [{ name: 'Website', value: 42 }, { name: 'WhatsApp', value: 28 }, { name: 'Walk-in', value: 17 }, { name: 'Referral', value: 13 }],
    followUpPerformance: [{ name: 'Completed', value: 24 }, { name: 'Pending', value: 5 }, { name: 'Rescheduled', value: 3 }, { name: 'Overdue', value: 2 }],
    conversionOverview: [{ name: 'My leads', value: 42 }, { name: 'Contacted', value: 31 }, { name: 'Qualified', value: 18 }, { name: 'Follow-up', value: 12 }, { name: 'Negotiation', value: 7 }, { name: 'Booking', value: 5 }, { name: 'Closed won', value: 3 }],
    agentPerformance: null,
    recentLeads: [{ name: 'Ahmed Khan', initials: 'AK', source: 'Website', interest: '1 Bed Apartment', agent: 'Ali Raza', status: 'Hot', created: 'Today' }, { name: 'Zoya Tariq', initials: 'ZT', source: 'Walk-in', interest: 'Food Court Space', agent: 'Ali Raza', status: 'Contacted', created: 'Yesterday' }, { name: 'Hira Malik', initials: 'HM', source: 'Referral', interest: '2 Bed Apartment', agent: 'Ali Raza', status: 'Follow-up', created: 'Oct 06' }],
    todayFollowUps: [{ time: '10:00 AM', customer: 'Ahmed Khan', type: 'Phone call', agent: 'Ali Raza', status: 'Pending' }, { time: '03:00 PM', customer: 'Zoya Tariq', type: 'Plan review', agent: 'Ali Raza', status: 'Overdue' }, { time: '05:00 PM', customer: 'Hira Malik', type: 'WhatsApp', agent: 'Ali Raza', status: 'Completed' }]
  }
};

function passwordHash(password, salt = 'aureum-local-demo') {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const users = [
  { id: 'usr_001', full_name: 'Malik Raza', email: 'admin@aureum.com', phone: '0300-0000001', password_hash: passwordHash('Aureum123!'), role: 'super_admin', team_id: null, status: 'active' },
  { id: 'usr_002', full_name: 'Sales Manager', email: 'manager@aureum.com', phone: '0300-0000002', password_hash: passwordHash('Aureum123!'), role: 'sales_manager', team_id: 'team_a', status: 'active' },
  { id: 'usr_003', full_name: 'Ali Raza', email: 'advisor@aureum.com', phone: '0300-0000003', password_hash: passwordHash('Aureum123!'), role: 'sales_agent', team_id: 'team_a', status: 'active' },
  { id: 'usr_004', full_name: 'Hamza Khan', email: 'hamza@aureum.com', phone: '0300-0000004', password_hash: passwordHash('Aureum123!'), role: 'sales_agent', team_id: 'team_a', status: 'active' },
  { id: 'usr_005', full_name: 'Sara Ahmed', email: 'sara@aureum.com', phone: '0300-0000005', password_hash: passwordHash('Aureum123!'), role: 'sales_agent', team_id: 'team_a', status: 'active' },
  { id: 'usr_006', full_name: 'Ayesha Noor', email: 'ayesha@aureum.com', phone: '0300-0000006', password_hash: passwordHash('Aureum123!'), role: 'sales_agent', team_id: 'team_b', status: 'active' },
  { id: 'usr_007', full_name: 'Hassan Ahmed', email: 'hassan@aureum.com', phone: '0300-0000007', password_hash: passwordHash('Aureum123!'), role: 'sales_manager', team_id: 'team_b', status: 'active' },
  { id: 'usr_008', full_name: 'Noor Fatima', email: 'noor@aureum.com', phone: '0300-0000008', password_hash: passwordHash('Aureum123!'), role: 'sales_agent', team_id: 'team_b', status: 'pending', must_change_password: true, has_temporary_password: true, temporary_password_expires_at: '2026-10-11T08:00:00.000Z' }
];

const CRM_TIMEZONE = 'Asia/Karachi';
const USER_INVITE_STATUSES = ['Not Sent', 'Pending', 'Sent', 'Accepted', 'Expired', 'Failed'];
const USER_ACTIVITY_STATUSES = ['Online', 'Offline', 'Away'];
const USER_STATUS_LABELS = { active: 'Active', inactive: 'Inactive', pending: 'Pending', suspended: 'Suspended' };
const USER_ROLE_LABELS = { super_admin: 'Super Admin', sales_manager: 'Sales Manager', sales_agent: 'Sales Agent' };
const teams = [
  { id: 'team_a', name: 'Sales Team A', description: 'Primary Lahore sales desk', manager_id: 'usr_002' },
  { id: 'team_b', name: 'Sales Team B', description: 'Expansion and partner sales desk', manager_id: 'usr_007' }
];
const userInvites = new Map();
const userAuditLogs = new Map();
users.forEach((user, index) => {
  const createdAt = user.created_at || '2026-10-01T08:00:00.000Z';
  user.created_at = createdAt;
  user.updated_at = user.updated_at || createdAt;
  user.invite_status = user.id === 'usr_006' ? 'Expired' : user.id === 'usr_008' ? 'Pending' : index === 1 ? 'Sent' : 'Accepted';
  user.activity_status = index < 3 ? 'Online' : index === 3 ? 'Away' : 'Offline';
  user.must_change_password = Boolean(user.must_change_password);
  user.has_temporary_password = Boolean(user.has_temporary_password);
  user.temporary_password_expires_at = user.temporary_password_expires_at || undefined;
  user.access_email_sent_at = user.access_email_sent_at || (user.invite_status === 'Sent' ? '2026-10-08T08:15:00.000Z' : undefined);
  user.invite_accepted_at = user.invite_status === 'Accepted' ? '2026-10-02T09:00:00.000Z' : undefined;
  user.last_login_at = user.last_login_at || (index < 5 ? '2026-10-09T07:30:00.000Z' : undefined);
  user.last_activity_at = user.last_activity_at || user.last_login_at || user.updated_at;
  user.created_by = user.created_by || 'usr_001';
  user.created_by_name = user.created_by_name || 'Malik Raza';
});

let leads = [
  { id: 'lead_001', full_name: 'Ahmed Khan', initials: 'AK', phone: '0321-4829100', whatsapp_number: '0321-4829100', email: 'ahmed@example.com', city: 'Lahore', area: 'Bahria Town', interested_in: '1 Bed Apartment', property_type: 'Apartment', budget: 'PKR 25M', preferred_location: 'Sector C', purpose: 'Investment', buying_timeline: 'Within 30 days', financing_required: false, lead_source: 'Website', status: 'Hot', priority: 'High', tags: ['High Intent', 'Apartment Buyer'], assigned_agent_id: 'usr_003', assigned_agent: 'Ali Raza', assigned_team_id: 'team_a', created_by: 'usr_002', last_contacted_at: 'Today', next_follow_up_at: 'Today · 4:00 PM', created_at: '2026-10-08', updated_at: '2026-10-08' },
  { id: 'lead_002', full_name: 'Sara Malik', initials: 'SM', phone: '0300-8458921', whatsapp_number: '0300-8458921', email: 'sara@example.com', city: 'Lahore', area: 'Gulberg', interested_in: 'Commercial Shop', property_type: 'Commercial', budget: 'PKR 35M', preferred_location: 'Mall Commercial Hub', purpose: 'Business', buying_timeline: '1–3 months', financing_required: false, lead_source: 'WhatsApp', status: 'New', priority: 'Medium', tags: ['Commercial Interest'], assigned_agent_id: 'usr_003', assigned_agent: 'Ali Raza', assigned_team_id: 'team_a', created_by: 'usr_002', last_contacted_at: 'Not contacted', next_follow_up_at: 'Tomorrow · 11:00 AM', created_at: '2026-10-08', updated_at: '2026-10-08' },
  { id: 'lead_003', full_name: 'Usman Ali', initials: 'UA', phone: '0333-7192834', whatsapp_number: '0333-7192834', email: 'usman@example.com', city: 'Islamabad', area: 'F-8', interested_in: 'Corporate Office', property_type: 'Commercial', budget: 'PKR 40M', preferred_location: 'Business District', purpose: 'Business', buying_timeline: '1–3 months', financing_required: true, lead_source: 'Sales Partner', status: 'Follow-up', priority: 'High', tags: ['High Budget', 'Follow-up Needed'], assigned_agent_id: 'usr_002', assigned_agent: 'Sales Manager', assigned_team_id: 'team_a', created_by: 'usr_002', last_contacted_at: 'Yesterday', next_follow_up_at: 'Oct 10 · 10:30 AM', created_at: '2026-10-07', updated_at: '2026-10-08' },
  { id: 'lead_004', full_name: 'Fatima Ahmed', initials: 'FA', phone: '0345-6291045', whatsapp_number: '0345-6291045', email: 'fatima@example.com', city: 'Lahore', area: 'DHA', interested_in: '2 Bed Apartment', property_type: 'Apartment', budget: 'PKR 32M', preferred_location: 'Sector C', purpose: 'End use', buying_timeline: 'Within 30 days', financing_required: false, lead_source: 'Facebook', status: 'Visit Scheduled', priority: 'VIP', tags: ['VIP', 'Family Buyer'], assigned_agent_id: 'usr_002', assigned_agent: 'Sales Manager', assigned_team_id: 'team_a', created_by: 'usr_002', last_contacted_at: 'Today', next_follow_up_at: 'Today · 6:00 PM', created_at: '2026-10-07', updated_at: '2026-10-08' },
  { id: 'lead_005', full_name: 'Bilal Hussain', initials: 'BH', phone: '0312-9012384', whatsapp_number: '0312-9012384', email: 'bilal@example.com', city: 'Faisalabad', area: 'Canal Road', interested_in: 'Hotel Room', property_type: 'Hospitality', budget: 'PKR 50M', preferred_location: 'Hospitality Wing', purpose: 'Investment', buying_timeline: 'Exploring', financing_required: false, lead_source: 'Website', status: 'Negotiation', priority: 'High', tags: ['Investor', 'High Budget'], assigned_agent_id: 'usr_002', assigned_agent: 'Sales Manager', assigned_team_id: 'team_a', created_by: 'usr_002', last_contacted_at: 'Yesterday', next_follow_up_at: 'Oct 09 · 2:00 PM', created_at: '2026-10-06', updated_at: '2026-10-08' },
  { id: 'lead_006', full_name: 'Zoya Tariq', initials: 'ZT', phone: '0322-1144789', whatsapp_number: '0322-1144789', email: 'zoya.t@example.com', city: 'Lahore', area: 'Model Town', interested_in: 'Food Court Space', property_type: 'Commercial', budget: 'PKR 28M', preferred_location: 'Food Court', purpose: 'Business', buying_timeline: '1–3 months', financing_required: false, lead_source: 'Walk-in', status: 'Contacted', priority: 'Medium', tags: ['Retail VIP'], assigned_agent_id: 'usr_003', assigned_agent: 'Ali Raza', assigned_team_id: 'team_a', created_by: 'usr_003', last_contacted_at: '2 days ago', next_follow_up_at: 'Oct 11 · 12:00 PM', created_at: '2026-10-05', updated_at: '2026-10-08' }
];
const leadActivities = new Map(leads.map(lead => [lead.id, [{ id: `${lead.id}_activity_1`, activity_type: 'Lead created', description: `Lead created from ${lead.lead_source}`, user_id: lead.created_by, created_at: lead.created_at }]]));

let customers = leads.slice(0, 5).map((lead, index) => ({
  id: `customer_${String(index + 1).padStart(3, '0')}`,
  lead_id: lead.id,
  full_name: lead.full_name,
  phone: lead.phone,
  whatsapp_number: lead.whatsapp_number,
  email: lead.email,
  city: lead.city,
  area: lead.area,
  preferred_contact_method: index % 2 ? 'WhatsApp' : 'Phone call',
  interested_in: lead.interested_in,
  property_type: lead.property_type,
  budget: lead.budget,
  preferred_location: lead.preferred_location,
  purpose: lead.purpose,
  buying_timeline: lead.buying_timeline,
  financing_required: lead.financing_required,
  customer_status: index === 0 ? 'Hot' : index === 1 ? 'Active' : index === 2 ? 'Follow-up' : index === 3 ? 'Booking Interested' : 'Active',
  lead_source: lead.lead_source,
  tags: lead.tags,
  assigned_agent_id: lead.assigned_agent_id,
  assigned_agent: lead.assigned_agent,
  assigned_team_id: lead.assigned_team_id,
  created_by: lead.created_by,
  last_contacted_at: lead.last_contacted_at,
  next_follow_up_at: lead.next_follow_up_at,
  created_at: lead.created_at,
  updated_at: lead.updated_at
}));
const customerActivities = new Map(customers.map(customer => [customer.id, [{ id: `${customer.id}_activity_1`, activity_type: 'Customer profile created', description: `Profile linked from ${customer.lead_id}`, user_id: customer.created_by, created_at: customer.created_at }]]));
const customerNotes = new Map(customers.map(customer => [customer.id, [{ id: `${customer.id}_note_1`, note: 'Initial inquiry captured and routed for a timely follow-up.', user_id: customer.assigned_agent_id, created_at: customer.created_at }]]));
const customerFollowUps = new Map(customers.map(customer => [customer.id, [{ id: `${customer.id}_followup_1`, type: 'Phone call', due_date: customer.next_follow_up_at, agent: customer.assigned_agent, status: customer.customer_status === 'Follow-up' ? 'Pending' : 'Completed', note: 'Review the latest payment plan and next steps.' }]]));

const followUpSeed = [
  { id: 'followup_001', customer_id: 'customer_001', lead_id: 'lead_001', follow_up_type: 'Phone call', due_date: '2026-10-08', due_time: '10:00', priority: 'High', status: 'Pending', notes: 'Discuss Floor 4 suite booking and payment plan.' },
  { id: 'followup_002', customer_id: 'customer_002', lead_id: 'lead_002', follow_up_type: 'WhatsApp', due_date: '2026-10-09', due_time: '12:30', priority: 'Medium', status: 'Pending', notes: 'Send the commercial payment schedule.' },
  { id: 'followup_003', customer_id: 'customer_003', lead_id: 'lead_003', follow_up_type: 'Payment Plan Follow-up', due_date: '2026-10-07', due_time: '15:00', priority: 'High', status: 'Overdue', notes: 'Confirm escrow installment milestone.' },
  { id: 'followup_004', customer_id: 'customer_004', lead_id: 'lead_004', follow_up_type: 'Site Visit Reminder', due_date: '2026-10-08', due_time: '17:00', priority: 'Medium', status: 'Completed', notes: 'On-site gallery booking confirmed.' },
  { id: 'followup_005', customer_id: 'customer_005', lead_id: 'lead_005', follow_up_type: 'Booking Follow-up', due_date: '2026-10-11', due_time: '11:00', priority: 'Low', status: 'Rescheduled', notes: 'Review hotel room investment documents.' }
];
let followUps = followUpSeed.map(item => {
  const customer = customers.find(entry => entry.id === item.customer_id);
  return { ...item, customer_name: customer?.full_name || 'Unknown customer', customer_phone: customer?.phone || '', assigned_agent_id: customer?.assigned_agent_id || null, assigned_agent: customer?.assigned_agent || 'Unassigned', assigned_team_id: customer?.assigned_team_id || null, lead_status: customer?.customer_status || 'Active', last_activity: customer?.last_contacted_at || 'Not contacted', created_by: customer?.created_by || customer?.assigned_agent_id || null, created_at: '2026-10-08T08:00:00.000Z', updated_at: '2026-10-08T08:00:00.000Z', reschedule_history: [] };
});
const followUpActivities = new Map(followUps.map(item => [item.id, [{ id: `${item.id}_activity_1`, activity_type: 'Follow-up scheduled', description: `${item.follow_up_type} scheduled for ${item.due_date} at ${item.due_time}`, user_id: item.assigned_agent_id, created_at: item.created_at }]]));

function publicUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function userTeamName(teamId) { return teams.find(team => team.id === teamId)?.name || ''; }
function userScopedTo(actor, target) { return Boolean(actor && target && (actor.role === 'super_admin' || (actor.role === 'sales_manager' && target.role === 'sales_agent' && target.team_id === actor.team_id))); }
function userActivityStatus(user) { return user.activity_status || (user.status !== 'active' ? 'Offline' : 'Online'); }
function userManagementView(actor, target) {
  const safe = publicUser(target);
  return { ...safe, fullName: target.full_name, avatarUrl: target.avatar_url, roleLabel: USER_ROLE_LABELS[target.role] || target.role, teamId: target.team_id || undefined, teamName: userTeamName(target.team_id), status: USER_STATUS_LABELS[target.status] || target.status, inviteStatus: target.invite_status || 'Not Sent', activityStatus: userActivityStatus(target), mustChangePassword: Boolean(target.must_change_password), hasTemporaryPassword: Boolean(target.has_temporary_password), temporaryPasswordExpiresAt: target.temporary_password_expires_at, accessEmailSentAt: target.access_email_sent_at, inviteAcceptedAt: target.invite_accepted_at, lastLoginAt: target.last_login_at, lastActivityAt: target.last_activity_at, createdBy: target.created_by || 'usr_001', createdByName: target.created_by_name || 'Malik Raza', createdAt: target.created_at, updatedAt: target.updated_at, canManage: userScopedTo(actor, target), canMessage: canMessageUser(actor, target), reportPath: `/reports?agentId=${encodeURIComponent(target.id)}` };
}
function userManagementTeams(actor) { return teams.filter(team => actor.role === 'super_admin' || team.id === actor.team_id).map(team => ({ id: team.id, name: team.name, description: team.description, managerId: team.manager_id, managerName: users.find(user => user.id === team.manager_id)?.full_name || '', memberCount: users.filter(user => user.team_id === team.id).length })); }
function generateTemporaryPassword() { return `Aureum${crypto.randomBytes(4).toString('hex').toUpperCase()}!9`; }
function temporaryPasswordExpiry() { return new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(); }
function userAuditView(item) { return { ...item, createdAt: item.created_at, actorUserId: item.actor_user_id, actorName: users.find(user => user.id === item.actor_user_id)?.full_name || item.actor_name || 'Aureum workspace' }; }

function canViewLead(user, lead) {
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'sales_manager') return true;
  return lead.assigned_agent_id === user.id;
}

function leadView(lead) {
  return { ...lead, meta: `${lead.phone} · ${lead.city}`, interest: lead.interested_in, budget: lead.budget, source: lead.lead_source, agent: lead.assigned_agent || 'Unassigned', tag: lead.tags?.[0] || '', next: lead.next_follow_up_at, contacted: lead.last_contacted_at };
}

function addLeadActivity(leadId, userId, activityType, description, metadata = {}) {
  const entries = leadActivities.get(leadId) || [];
  entries.unshift({ id: crypto.randomUUID(), lead_id: leadId, user_id: userId, activity_type: activityType, description, metadata, created_at: new Date().toISOString() });
  leadActivities.set(leadId, entries);
}

function findLead(id) { return leads.find(lead => lead.id === id); }

function canViewCustomer(user, customer) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'sales_manager') return customer.assigned_team_id === user.team_id;
  return customer.assigned_agent_id === user.id;
}

function customerView(customer) {
  return { ...customer, meta: `${customer.phone} · ${customer.city}`, interest: customer.interested_in, budget: customer.budget, status: customer.customer_status, source: customer.lead_source, agent: customer.assigned_agent, next: customer.next_follow_up_at, last_activity: customer.last_contacted_at };
}

function addCustomerActivity(customerId, userId, activityType, description, metadata = {}) {
  const entries = customerActivities.get(customerId) || [];
  entries.unshift({ id: crypto.randomUUID(), customer_id: customerId, user_id: userId, activity_type: activityType, description, metadata, created_at: new Date().toISOString() });
  customerActivities.set(customerId, entries);
}

function canViewFollowUp(user, item) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'sales_manager') return item.assigned_team_id === user.team_id;
  return item.assigned_agent_id === user.id;
}

function refreshFollowUpStatuses() {
  const now = Date.now();
  followUps.forEach(item => {
    if (item.status !== 'Pending') return;
    const due = new Date(`${item.due_date}T${item.due_time || '23:59'}:00`).getTime();
    if (!Number.isNaN(due) && due < now) item.status = 'Overdue';
  });
}

function followUpView(item) {
  return { ...item, due_at: `${item.due_date} · ${item.due_time}`, type: item.follow_up_type, customer: item.customer_name, phone: item.customer_phone, agent: item.assigned_agent };
}

function findFollowUp(id) { return followUps.find(item => item.id === id); }

function addFollowUpActivity(item, userId, activityType, description, metadata = {}) {
  const entries = followUpActivities.get(item.id) || [];
  entries.unshift({ id: crypto.randomUUID(), follow_up_id: item.id, user_id: userId, activity_type: activityType, description, metadata, created_at: new Date().toISOString() });
  followUpActivities.set(item.id, entries);
  addCustomerActivity(item.customer_id, userId, activityType, description, metadata);
  const customer = customers.find(entry => entry.id === item.customer_id);
  if (customer?.lead_id) addLeadActivity(customer.lead_id, userId, activityType, description, metadata);
}

function dashboardForUser(user) {
  const visibleLeads = leads.filter(lead => canViewLead(user, lead));
  const visibleCustomers = customers.filter(customer => canViewCustomer(user, customer));
  const visibleFollowUps = followUps.filter(item => canViewFollowUp(user, item));
  const completed = visibleFollowUps.filter(item => item.status === 'Completed').length;
  const overdue = visibleFollowUps.filter(item => item.status === 'Overdue').length;
  const pending = visibleFollowUps.filter(item => ['Pending', 'Rescheduled'].includes(item.status)).length;
  const closed = visibleLeads.filter(lead => lead.status === 'Closed Won').length;
  const today = new Date().toISOString().slice(0, 10);
  const summary = { totalLeads: visibleLeads.length, newLeads: visibleLeads.filter(lead => lead.status === 'New').length, hotLeads: visibleLeads.filter(lead => ['Hot', 'Booking'].includes(lead.status)).length, followUpsDue: pending, overdueFollowUps: overdue, activeCustomers: visibleCustomers.filter(customer => !['Closed Won', 'Closed Lost', 'Not Interested'].includes(customer.customer_status)).length, closedDeals: closed, conversionRate: visibleLeads.length ? Number(((closed / visibleLeads.length) * 100).toFixed(1)) : 0, bookingVolume: 'PKR 18M' };
  const todayFollowUps = visibleFollowUps.filter(item => item.due_date === today || item.status === 'Overdue').slice(0, 8).map(item => ({ time: item.due_time, customer: item.customer_name, type: item.follow_up_type, agent: item.assigned_agent, status: item.status }));
  const recentLeads = visibleLeads.slice(0, 8).map(lead => ({ name: lead.full_name, initials: lead.initials, source: lead.lead_source, interest: lead.interested_in, agent: lead.assigned_agent, status: lead.status, created: lead.created_at }));
  const base = dashboardByRole[user.role] || dashboardByRole.sales_agent;
  return { ...base, summary, todayFollowUps, recentLeads, followUpPerformance: [{ name: 'Completed', value: completed }, { name: 'Pending', value: pending }, { name: 'Overdue', value: overdue }, { name: 'Missed', value: visibleFollowUps.filter(item => item.status === 'Missed').length }] };
}

const chatChannels = [
  { id: 'channel_general', name: 'General', description: 'Company-wide internal updates and helpful context.', visibility: 'public', members: ['usr_001', 'usr_002', 'usr_003'] },
  { id: 'channel_sales', name: 'Sales Team', description: 'Daily sales coordination and pipeline movement.', visibility: 'public', members: ['usr_001', 'usr_002', 'usr_003'] },
  { id: 'channel_announcements', name: 'Announcements', description: 'Important updates from sales leadership.', visibility: 'public', members: ['usr_001', 'usr_002', 'usr_003'] },
  { id: 'channel_followups', name: 'Follow-ups', description: 'Coordinate daily client touchpoints and recovery actions.', visibility: 'public', members: ['usr_001', 'usr_002', 'usr_003'] },
  { id: 'channel_bookings', name: 'Bookings', description: 'Internal booking and reservation coordination.', visibility: 'public', members: ['usr_001', 'usr_002', 'usr_003'] },
  { id: 'channel_management', name: 'Management', description: 'Private management-level sales operations.', visibility: 'management', members: ['usr_001', 'usr_002'] }
];
const chatMessages = new Map([
  ['channel_general', [{ id: 'msg_general_1', sender_id: 'usr_002', message_text: 'Welcome to the Aureum internal workspace. Keep client updates clear and actionable.', created_at: '2026-10-08T08:30:00.000Z' }]],
  ['channel_sales', [{ id: 'msg_sales_1', sender_id: 'usr_003', message_text: 'Ahmed Khan requested the payment plan for the 1 Bed Apartment.', created_at: '2026-10-08T10:20:00.000Z' }, { id: 'msg_sales_2', sender_id: 'usr_002', message_text: 'I will share the updated schedule before the 4 PM follow-up.', created_at: '2026-10-08T10:24:00.000Z' }]],
  ['channel_announcements', [{ id: 'msg_announcement_1', sender_id: 'usr_001', message_text: 'October sales review will take place this Friday at 4 PM.', created_at: '2026-10-08T09:00:00.000Z' }]],
  ['channel_followups', [{ id: 'msg_followups_1', sender_id: 'usr_002', message_text: 'Please recover overdue payment-plan follow-ups before close of day.', created_at: '2026-10-08T09:45:00.000Z' }]],
  ['channel_bookings', [{ id: 'msg_bookings_1', sender_id: 'usr_003', message_text: 'The Ahmed Khan site visit is confirmed for this afternoon.', created_at: '2026-10-08T10:05:00.000Z' }]],
  ['channel_management', [{ id: 'msg_management_1', sender_id: 'usr_001', message_text: 'Management review: team conversion is tracking against the October target.', created_at: '2026-10-08T08:50:00.000Z' }]]
]);
const directMessages = new Map();
const chatReadReceipts = new Map();
const groupChats = [
  { id: 'group_hot_leads', group_name: 'Hot Leads Team', description: 'High-intent opportunities requiring coordinated attention.', created_by: 'usr_002', member_ids: ['usr_001', 'usr_002', 'usr_003', 'usr_004'], is_archived: false, created_at: '2026-10-08T08:00:00.000Z', updated_at: '2026-10-08T10:24:00.000Z' },
  { id: 'group_followups_today', group_name: 'Today Follow-ups', description: 'Time-sensitive client touchpoints for today.', created_by: 'usr_002', member_ids: ['usr_001', 'usr_002', 'usr_003', 'usr_005'], is_archived: false, created_at: '2026-10-08T08:10:00.000Z', updated_at: '2026-10-08T09:45:00.000Z' },
  { id: 'group_bookings', group_name: 'Booking Discussion', description: 'Booking readiness, documents, and handoffs.', created_by: 'usr_001', member_ids: ['usr_001', 'usr_002', 'usr_003', 'usr_005'], is_archived: false, created_at: '2026-10-08T08:20:00.000Z', updated_at: '2026-10-08T10:05:00.000Z' }
];
const groupMessages = new Map([
  ['group_hot_leads', [{ id: 'msg_group_hot_1', group_id: 'group_hot_leads', sender_id: 'usr_002', message_text: 'Please keep the high-intent apartment inquiries updated before the afternoon review.', created_at: '2026-10-08T10:15:00.000Z' }]],
  ['group_followups_today', [{ id: 'msg_group_follow_1', group_id: 'group_followups_today', sender_id: 'usr_003', message_text: 'I have confirmed Ahmed Khan for the 4 PM payment-plan follow-up.', created_at: '2026-10-08T09:45:00.000Z' }]],
  ['group_bookings', [{ id: 'msg_group_booking_1', group_id: 'group_bookings', sender_id: 'usr_001', message_text: 'Use this group for booking documents and reservation handoffs.', created_at: '2026-10-08T10:05:00.000Z' }]]
]);
const chatAttachments = new Map([
  ['channel_sales', [{ id: 'attachment_sales_1', chat_id: 'channel_sales', message_id: 'msg_sales_2', file_name: 'October-payment-plan.pdf', file_type: 'pdf', file_size: '1.8 MB', uploaded_by: 'usr_002', uploaded_at: '2026-10-08T10:24:00.000Z' }]],
  ['group_bookings', [{ id: 'attachment_booking_1', chat_id: 'group_bookings', message_id: 'msg_group_booking_1', file_name: 'Booking-checklist.docx', file_type: 'document', file_size: '248 KB', uploaded_by: 'usr_001', uploaded_at: '2026-10-08T10:05:00.000Z' }]]
]);
const chatLinks = new Map([
  ['channel_sales', [{ id: 'link_sales_1', chat_id: 'channel_sales', title: 'Aureum payment plan workspace', url: 'https://aureum.example/internal/payment-plan', shared_by: 'usr_002', shared_at: '2026-10-08T10:24:00.000Z' }]],
  ['group_hot_leads', [{ id: 'link_hot_1', chat_id: 'group_hot_leads', title: 'Hot lead review board', url: 'https://aureum.example/internal/hot-leads', shared_by: 'usr_002', shared_at: '2026-10-08T10:15:00.000Z' }]]
]);
const userActivities = new Map(users.map(user => [user.id, [{ id: `${user.id}_activity_1`, activity_type: 'User profile active', description: `${user.full_name} is available in the Aureum workspace.`, created_at: '2026-10-08T08:00:00.000Z' }]]));

const systemSettings = {
  company: { company_name: 'Aureum Mall & Residences', crm_name: 'Aureum Sales CRM', logo_url: '', email: 'hello@aureum.com', phone: '0300-0000000', address: 'Aureum Mall & Residences, Lahore', timezone: 'Asia/Karachi', currency: 'PKR' },
  preferences: { default_lead_status: 'New', default_lead_source: 'Manual Entry', default_dashboard_range: 'This month', default_timezone: 'Asia/Karachi', default_currency: 'PKR', default_table_page_size: 25, default_follow_up_reminder_minutes: 30 },
  security: { temporary_password_expiry_hours: 72, force_password_change_first_login: true, minimum_password_length: 8, require_uppercase: true, require_lowercase: true, require_number: true, require_special_character: true, block_inactive_suspended_login: true },
  email_access: { sender_name: 'Aureum Sales CRM', sender_email: 'noreply@aureum.com', access_email_subject: 'Your Aureum CRM access', access_email_template: 'Welcome to the Aureum Sales CRM workspace. Use the secure access details provided by your administrator.', password_reset_subject: 'Your Aureum CRM password was reset', password_reset_template: 'Your temporary password has been reset. Sign in and change it immediately.', email_enabled: true }
};
const accountPreferences = new Map(users.map(user => [user.id, {
  notifications: { new_lead_assigned: true, follow_up_due: true, follow_up_overdue: true, team_chat_message: true, daily_digest: false },
  appearance: { theme: 'light', compact_mode: false, sidebar_collapsed: false },
  display: { language: 'English', timezone: 'Asia/Karachi', date_format: 'DD MMM YYYY', time_format: '12-hour' }
}]));
const leadStatuses = [
  ['New', '#8d7658'], ['Contacted', '#6d8c9b'], ['Qualified', '#6d8c9b'], ['Hot', '#b36b55'], ['Warm', '#b6904f'], ['Cold', '#9e9a92'], ['Follow-up', '#b6904f'], ['No Response', '#9e9a92'], ['Visit Scheduled', '#6d8c9b'], ['Visit Completed', '#6d8c9b'], ['Meeting Scheduled', '#6d8c9b'], ['Negotiation', '#8a6c9c'], ['Booking', '#b6904f'], ['Closed Won', '#5d9670'], ['Closed Lost', '#a84c45'], ['Not Interested', '#9e9a92'], ['Invalid', '#a84c45']
].map((item, index) => ({ id: `status_${String(index + 1).padStart(3, '0')}`, name: item[0], slug: item[0].toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: item[1], sort_order: index + 1, is_active: true, is_default: item[0] === 'New', created_at: '2026-10-08T08:00:00.000Z', updated_at: '2026-10-08T08:00:00.000Z' }));
const leadTags = ['VIP', 'Investor', 'Urgent', 'Family Buyer', 'Commercial Interest', 'High Budget', 'Payment Plan Required', 'Follow-up Needed', 'Repeat Customer'].map((name, index) => ({ id: `tag_${String(index + 1).padStart(3, '0')}`, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: index % 2 ? '#b6904f' : '#8d7658', tag_type: 'lead', is_active: true, created_at: '2026-10-08T08:00:00.000Z', updated_at: '2026-10-08T08:00:00.000Z' }));
const leadSources = ['Website', 'WhatsApp', 'Facebook', 'Sales Partner', 'Walk-in', 'Referral', 'Manual Entry'].map((name, index) => ({ id: `source_${String(index + 1).padStart(3, '0')}`, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), is_active: true, is_default: name === 'Manual Entry', created_at: '2026-10-08T08:00:00.000Z', updated_at: '2026-10-08T08:00:00.000Z' }));
const notificationDefinitions = [
  ['new_lead_assigned', 'New lead assigned'], ['follow_up_due', 'Follow-up due'], ['follow_up_overdue', 'Follow-up overdue'], ['follow_up_completed', 'Follow-up completed'], ['lead_status_changed', 'Lead status changed'], ['customer_note_added', 'Customer note added'], ['team_chat_message', 'New team chat message'], ['user_added', 'User added'], ['deal_closed_won', 'Deal closed won'], ['deal_closed_lost', 'Deal closed lost']
].map(([event_key, event_name]) => ({ event_key, event_name, in_app_enabled: true, email_enabled: false, whatsapp_enabled: false, sms_enabled: false }));
const notificationSettings = new Map(users.map(user => [user.id, notificationDefinitions.map(item => ({ ...item }))]));
const notifications = new Map(users.map(user => [user.id, [
  { id: `${user.id}_notification_1`, event_type: 'follow_up_due', title: 'Follow-up due today', message: 'Review the next promised customer touchpoint in your workspace.', related_entity_type: 'follow_up', related_entity_id: 'followup_001', is_read: false, created_at: '2026-10-08T08:30:00.000Z' },
  { id: `${user.id}_notification_2`, event_type: 'team_chat_message', title: 'Team chat update', message: 'Sales Team has a new internal message.', related_entity_type: 'channel', related_entity_id: 'channel_sales', is_read: user.role === 'sales_agent', created_at: '2026-10-08T08:15:00.000Z' }
]]));
const activityLogs = [{ id: 'audit_001', actor_user_id: 'usr_001', entity_type: 'system', entity_id: 'settings', action_type: 'Workspace initialized', description: 'Aureum Sales CRM workspace initialized.', metadata: {}, created_at: '2026-10-08T08:00:00.000Z' }];
const permissionCatalog = [
  ['dashboard.view', 'View dashboard'], ['leads.view_all', 'View all leads'], ['leads.view_own', 'View own leads'], ['leads.create', 'Add new lead'], ['leads.assign', 'Assign leads'], ['customers.view', 'View customers'], ['followups.manage', 'Manage follow-ups'], ['chat.use', 'Use team chat'], ['reports.view', 'View reports'], ['agents.manage', 'Manage agents'], ['settings.manage', 'Access settings']
];

function addActivityLog(actorUserId, entityType, entityId, actionType, description, metadata = {}) {
  activityLogs.unshift({ id: crypto.randomUUID(), actor_user_id: actorUserId, entity_type: entityType, entity_id: entityId, action_type: actionType, description, metadata, created_at: new Date().toISOString() });
}
function addUserAudit(targetId, actorId, action, description) { const entry = { id: crypto.randomUUID(), user_id: targetId, action, description, actor_user_id: actorId, actor_name: users.find(user => user.id === actorId)?.full_name || 'Aureum workspace', created_at: new Date().toISOString() }; userAuditLogs.set(targetId, [entry, ...(userAuditLogs.get(targetId) || [])]); addActivityLog(actorId, 'user', targetId, action, description); return entry; }
function userDetailPayload(actor, target) { return { user: userManagementView(actor, target), auditLogs: (userAuditLogs.get(target.id) || []).map(userAuditView).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) }; }
function normalizeUserStatus(value) { const raw = String(value || '').trim(); return ({ Active: 'active', Inactive: 'inactive', Pending: 'pending', Suspended: 'suspended', active: 'active', inactive: 'inactive', pending: 'pending', suspended: 'suspended' })[raw] || 'active'; }
function canCreateManagedUser(actor, role) { return Boolean(actor && ['sales_manager', 'sales_agent'].includes(role) && (actor.role === 'super_admin' || (actor.role === 'sales_manager' && role === 'sales_agent'))); }
function canManageTeam(actor, teamId) { return Boolean(actor?.role === 'super_admin' || (actor?.role === 'sales_manager' && (!teamId || teamId === actor.team_id))); }
function sendUserAccessEmail(actor, target, action = 'access_email_sent') { const temporaryPassword = generateTemporaryPassword(); target.password_hash = passwordHash(temporaryPassword); target.must_change_password = true; target.has_temporary_password = true; target.temporary_password_expires_at = temporaryPasswordExpiry(); target.invite_status = 'Sent'; target.access_email_sent_at = new Date().toISOString(); target.updated_at = new Date().toISOString(); userInvites.set(target.id, { userId: target.id, temporaryPassword, sentAt: target.access_email_sent_at, status: 'sent', expiresAt: target.temporary_password_expires_at }); addUserAudit(target.id, actor.id, action, `${action === 'password_reset' ? 'Temporary password reset' : 'Access email sent'} for ${target.full_name}.`); return { success: true, status: 'sent', message: 'Access email sent successfully.', sentAt: target.access_email_sent_at, temporaryPasswordPreview: temporaryPassword }; }
function settingsView() { return { company: { ...systemSettings.company }, preferences: { ...systemSettings.preferences }, security: { ...systemSettings.security }, emailAccess: { ...systemSettings.email_access } }; }
function settingSlug(name) { return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function settingEntityUsed(type, value) { if (type === 'status') return leads.some(item => item.status === value); if (type === 'source') return leads.some(item => item.lead_source === value); return false; }
function notificationView(item) { return { ...item, actor: users.find(user => user.id === item.actor_user_id)?.full_name || 'Aureum workspace' }; }

function canViewChannel(user, channel) { return Boolean(user && (channel.visibility !== 'management' || ['super_admin', 'sales_manager'].includes(user.role))); }
function chatUserView(user) { return { id: user.id, full_name: user.full_name, initials: user.full_name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase(), role: user.role, status: user.status, online: user.status === 'active' }; }
function chatMessageView(message) { const sender = users.find(user => user.id === message.sender_id); return { ...message, sender: sender ? chatUserView(sender) : { full_name: 'Unknown user', initials: '??' } }; }
function directKey(first, second) { return [first, second].sort().join(':'); }
function canMessageUser(user, target) { return Boolean(user && target && user.id !== target.id); }
function canCreateGroup(user) { return Boolean(user && ['super_admin', 'sales_manager'].includes(user.role)); }
function canManageGroup(user, group) { return Boolean(user && group && (user.role === 'super_admin' || (user.role === 'sales_manager' && group.created_by === user.id))); }
function canAccessGroup(user, group) { return Boolean(user && group && !group.is_archived && group.member_ids.includes(user.id)); }
function canAddGroupMember(user, target) { return Boolean(user && target && (user.role === 'super_admin' || (user.role === 'sales_manager' && target.team_id === user.team_id))); }
function groupView(user, group) {
  const messages = groupMessages.get(group.id) || []; const last = messages[messages.length - 1]; const creator = users.find(item => item.id === group.created_by);
  return { id: group.id, groupName: group.group_name, description: group.description, createdBy: group.created_by, createdByName: creator?.full_name || 'Aureum user', ownerRole: creator?.role || 'sales_manager', memberIds: [...group.member_ids], members: group.member_ids.map(id => users.find(item => item.id === id)).filter(Boolean).map(chatUserView), isArchived: group.is_archived, createdAt: group.created_at, updatedAt: group.updated_at, lastMessage: last ? { messageId: last.id, senderId: last.sender_id, senderName: users.find(item => item.id === last.sender_id)?.full_name || 'Aureum user', body: last.message_text, messageType: last.message_type || 'text', createdAt: last.created_at } : undefined, unreadCount: 0, canManage: canManageGroup(user, group) };
}
function chatAttachmentView(attachment) { const uploader = users.find(item => item.id === attachment.uploaded_by); return { ...attachment, fileName: attachment.file_name, fileType: attachment.file_type, fileSize: attachment.file_size, uploadedBy: attachment.uploaded_by, uploadedByName: uploader?.full_name || 'Aureum user', uploadedAt: attachment.uploaded_at }; }
function chatLinkView(link) { const sharer = users.find(item => item.id === link.shared_by); return { ...link, sharedBy: link.shared_by, sharedByName: sharer?.full_name || 'Aureum user', sharedAt: link.shared_at }; }

function reportUsersFor(user) { return users.filter(item => ['sales_agent', 'sales_manager'].includes(item.role) && (user.role === 'super_admin' || item.team_id === user.team_id)); }
function reportRowsFor(user) {
  return reportUsersFor(user).map(agent => {
    const agentLeads = leads.filter(lead => lead.assigned_agent_id === agent.id);
    const agentFollowUps = followUps.filter(item => item.assigned_agent_id === agent.id);
    const closed = agentLeads.filter(lead => lead.status === 'Closed Won').length;
    const contacted = agentLeads.filter(lead => !['New', 'Not contacted'].includes(lead.status) && lead.last_contacted_at !== 'Not contacted').length;
    const overdue = agentFollowUps.filter(item => item.status === 'Overdue').length;
    const completed = agentFollowUps.filter(item => item.status === 'Completed').length;
    const conversion = agentLeads.length ? Number(((closed / agentLeads.length) * 100).toFixed(1)) : 0;
    const performance = conversion >= 20 && overdue <= 1 ? 'Excellent' : conversion >= 12 && overdue <= 2 ? 'Good' : conversion > 0 ? 'Average' : 'Needs Attention';
    return { id: agent.id, name: agent.full_name, initials: agent.full_name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase(), email: agent.email, phone: agent.phone, role: agent.role, team: agent.team_id || 'Unassigned', status: agent.status, assignedLeads: agentLeads.length, activeLeads: agentLeads.filter(lead => !['Closed Won', 'Closed Lost', 'Not Interested'].includes(lead.status)).length, contactedLeads: contacted, hotLeads: agentLeads.filter(lead => ['Hot', 'Booking'].includes(lead.status)).length, followUpsCompleted: completed, followUpsDue: agentFollowUps.filter(item => ['Pending', 'Rescheduled'].includes(item.status)).length, overdueFollowUps: overdue, closedDeals: closed, lostLeads: agentLeads.filter(lead => ['Closed Lost', 'Lost'].includes(lead.status)).length, conversionRate: `${conversion}%`, performance, lastActivity: agent.last_login_at || 'Today' };
  });
}

function agentInScope(actor, target) { return Boolean(actor && target && ['super_admin'].includes(actor.role) || actor && target && actor.role === 'sales_manager' && target.team_id === actor.team_id); }
function agentView(actor, target) { const row = reportRowsFor(actor).find(item => item.id === target.id) || {}; return { ...publicUser(target), ...row }; }

const REPORT_TIMEZONE = 'Asia/Karachi';
const REPORT_LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'No Response', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'Not Interested', 'Invalid'];
const REPORT_CUSTOMER_STATUSES = ['Active', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Booking Interested', 'Closed Won', 'Closed Lost', 'Not Interested'];
const REPORT_FOLLOWUP_STATUSES = ['Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled', 'Cancelled'];
const REPORT_CONTACTED_STATUSES = ['Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'Not Interested'];
const REPORT_ACTIVE_CUSTOMER_STATUSES = ['Active', 'Hot', 'Warm', 'Follow-up', 'Booking Interested'];
const REPORT_CONVERSION_STAGES = ['New', 'Contacted', 'Qualified', 'Follow-up', 'Negotiation', 'Booking', 'Closed Won'];
function reportRound(value) { return Number(Number(value || 0).toFixed(1)); }
function reportDateParts(value = new Date()) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); return Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, item.value])); }
function reportCalendarDate(value = new Date()) { const parts = reportDateParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function reportLocalDateTime(date, endOfDay = false) { return new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`); }
function reportDateBounds(params = {}) { const range = params.dateRange || 'this_month'; const today = reportCalendarDate(); const todayDate = new Date(`${today}T00:00:00Z`); let start = today; let end = today; if (range === 'yesterday') { const previous = new Date(todayDate); previous.setUTCDate(previous.getUTCDate() - 1); start = end = previous.toISOString().slice(0, 10); } else if (range === 'this_week') { const mondayOffset = (todayDate.getUTCDay() + 6) % 7; const monday = new Date(todayDate); monday.setUTCDate(monday.getUTCDate() - mondayOffset); const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6); start = monday.toISOString().slice(0, 10); end = sunday.toISOString().slice(0, 10); } else if (range === 'this_month' || !['today', 'last_month', 'custom'].includes(range)) { start = `${today.slice(0, 7)}-01`; const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(0); end = next.toISOString().slice(0, 10); } else if (range === 'last_month') { const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); first.setUTCMonth(first.getUTCMonth() - 1); const last = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); last.setUTCDate(0); start = first.toISOString().slice(0, 10); end = last.toISOString().slice(0, 10); } else if (range === 'custom') { start = /^\d{4}-\d{2}-\d{2}$/.test(params.startDate || '') ? params.startDate : today; end = /^\d{4}-\d{2}-\d{2}$/.test(params.endDate || '') ? params.endDate : start; if (end < start) [start, end] = [end, start]; } return { startDateTime: reportLocalDateTime(start), endDateTime: reportLocalDateTime(end, true), startDate: start, endDate: end, timezone: REPORT_TIMEZONE, dateRange: range }; }
function reportValueDate(value, fallbackTime = '00:00') { if (!value) return null; const raw = String(value); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return reportLocalDateTime(raw); if (/^\d{4}-\d{2}-\d{2} · \d{2}:\d{2}$/.test(raw)) return reportLocalDateTime(raw.slice(0, 10), false); if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw); const iso = new Date(raw); return Number.isNaN(iso.getTime()) ? null : iso; }
function reportInRange(value, bounds) { const date = reportValueDate(value); return Boolean(date && date >= bounds.startDateTime && date <= bounds.endDateTime); }
function reportRecordInScope(user, agentId, teamId) { return Boolean(user && (!agentId || agentId === 'all' || agentId === user.id || reportUsersFor(user).some(item => item.id === agentId)) && (!teamId || teamId === 'all' || user.role === 'super_admin' || teamId === user.team_id)); }
function reportScopedAgents(user, params) { const teamId = user.role === 'sales_manager' ? user.team_id : (params.teamId && params.teamId !== 'all' ? params.teamId : ''); const requestedAgent = params.agentId && params.agentId !== 'all' ? params.agentId : ''; return reportUsersFor(user).filter(agent => (!teamId || agent.team_id === teamId) && (!requestedAgent || agent.id === requestedAgent)); }
function reportAgentRow(user, agent, bounds, params = {}) {
  const leadStatus = params.leadStatus && params.leadStatus !== 'all' ? params.leadStatus : '';
  const leadSource = params.leadSource && params.leadSource !== 'all' ? params.leadSource : '';
  const followUpStatus = params.followUpStatus && params.followUpStatus !== 'all' ? params.followUpStatus : '';
  const agentLeads = leads.filter(item => item.assigned_agent_id === agent.id && reportInRange(item.created_at || item.updated_at, bounds) && (!leadStatus || item.status === leadStatus) && (!leadSource || item.lead_source === leadSource)); const agentCustomers = customers.filter(item => item.assigned_agent_id === agent.id && reportInRange(item.created_at || item.updated_at, bounds)); const agentFollowUps = followUps.filter(item => item.assigned_agent_id === agent.id && reportInRange(`${item.due_date}T${item.due_time || '00:00'}:00+05:00`, bounds) && (!followUpStatus || item.status === followUpStatus)); const closed = agentLeads.filter(item => item.status === 'Closed Won').length; const contacted = agentLeads.filter(item => Boolean(item.last_contacted_at && item.last_contacted_at !== 'Not contacted') || REPORT_CONTACTED_STATUSES.includes(item.status)).length; return { agentId: agent.id, agentName: agent.full_name, agentRole: agent.role === 'sales_manager' ? 'Sales Manager' : 'Sales Agent', teamId: agent.team_id || undefined, teamName: agent.team_id === 'team_a' ? 'Sales Team A' : agent.team_id === 'team_b' ? 'Sales Team B' : 'Leadership', status: agent.status === 'active' ? 'Active' : 'Inactive', assignedLeads: agentLeads.length, contactedLeads: contacted, hotLeads: agentLeads.filter(item => item.status === 'Hot').length, warmLeads: agentLeads.filter(item => item.status === 'Warm').length, coldLeads: agentLeads.filter(item => item.status === 'Cold').length, followUpsAssigned: agentFollowUps.length, followUpsCompleted: agentFollowUps.filter(item => item.status === 'Completed').length, overdueFollowUps: agentFollowUps.filter(item => item.status === 'Overdue').length, missedFollowUps: agentFollowUps.filter(item => item.status === 'Missed').length, totalCustomers: agentCustomers.length, activeCustomers: agentCustomers.filter(item => REPORT_ACTIVE_CUSTOMER_STATUSES.includes(item.customer_status)).length, bookingInterestedCustomers: agentCustomers.filter(item => item.customer_status === 'Booking Interested').length, closedDeals: closed, lostLeads: agentLeads.filter(item => item.status === 'Closed Lost').length, conversionRate: agentLeads.length ? reportRound((closed / agentLeads.length) * 100) : 0, lastActivityAt: agent.updated_at || agent.created_at || new Date().toISOString() };
}
function reportResponseFor(user, searchParams = new URLSearchParams()) {
  refreshFollowUpStatuses(); const params = Object.fromEntries(searchParams.entries()); const bounds = reportDateBounds(params); const scopedAgents = reportScopedAgents(user, params); const agentIds = new Set(scopedAgents.map(item => item.id)); const visibleLeads = leads.filter(item => canViewLead(user, item) && agentIds.has(item.assigned_agent_id) && reportInRange(item.created_at || item.updated_at, bounds)); const visibleCustomers = customers.filter(item => canViewCustomer(user, item) && agentIds.has(item.assigned_agent_id) && reportInRange(item.created_at || item.updated_at, bounds)); const visibleFollowUps = followUps.filter(item => canViewFollowUp(user, item) && agentIds.has(item.assigned_agent_id) && reportInRange(`${item.due_date}T${item.due_time || '00:00'}:00+05:00`, bounds)); const rows = scopedAgents.map(agent => reportAgentRow(user, agent, bounds)); const total = key => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0); const closedWon = visibleLeads.filter(item => item.status === 'Closed Won').length; const leadSummary = { totalLeads: visibleLeads.length, newLeads: visibleLeads.filter(item => item.status === 'New').length, contactedLeads: visibleLeads.filter(item => Boolean(item.last_contacted_at && item.last_contacted_at !== 'Not contacted') || REPORT_CONTACTED_STATUSES.includes(item.status)).length, hotLeads: visibleLeads.filter(item => item.status === 'Hot').length, warmLeads: visibleLeads.filter(item => item.status === 'Warm').length, coldLeads: visibleLeads.filter(item => item.status === 'Cold').length, closedWon, closedLost: visibleLeads.filter(item => item.status === 'Closed Lost').length, conversionRate: visibleLeads.length ? reportRound((closedWon / visibleLeads.length) * 100) : 0 }; const customerSummary = { totalCustomers: visibleCustomers.length, activeCustomers: visibleCustomers.filter(item => REPORT_ACTIVE_CUSTOMER_STATUSES.includes(item.customer_status)).length, hotCustomers: visibleCustomers.filter(item => item.customer_status === 'Hot').length, bookingInterestedCustomers: visibleCustomers.filter(item => item.customer_status === 'Booking Interested').length, closedCustomers: visibleCustomers.filter(item => item.customer_status === 'Closed Won').length, lostCustomers: visibleCustomers.filter(item => item.customer_status === 'Closed Lost').length }; const followUpSummary = { totalFollowUps: visibleFollowUps.length, todaysFollowUps: visibleFollowUps.filter(item => item.due_date === reportCalendarDate()).length, completedFollowUps: visibleFollowUps.filter(item => item.status === 'Completed').length, overdueFollowUps: visibleFollowUps.filter(item => item.status === 'Overdue').length, missedFollowUps: visibleFollowUps.filter(item => item.status === 'Missed').length, rescheduledFollowUps: visibleFollowUps.filter(item => item.status === 'Rescheduled').length, completionRate: visibleFollowUps.length ? reportRound((visibleFollowUps.filter(item => item.status === 'Completed').length / visibleFollowUps.length) * 100) : 0 }; const summary = { totalAgents: rows.length, assignedLeads: total('assignedLeads'), contactedLeads: total('contactedLeads'), hotLeads: total('hotLeads'), followUpsCompleted: total('followUpsCompleted'), overdueFollowUps: total('overdueFollowUps'), closedDeals: total('closedDeals'), lostLeads: total('lostLeads'), conversionRate: total('assignedLeads') ? reportRound((total('closedDeals') / total('assignedLeads')) * 100) : 0 }; const chart = (items, value) => items.map(item => ({ label: item, value: visibleLeads.filter(lead => value(lead) === item).length })); const conversionOverview = REPORT_CONVERSION_STAGES.map(stage => ({ stage, count: visibleLeads.filter(item => item.status === stage).length, percentage: visibleLeads.length ? reportRound((visibleLeads.filter(item => item.status === stage).length / visibleLeads.length) * 100) : 0 })); return { role: user.role, scope: user.role === 'super_admin' ? 'company' : 'team', dateRange: bounds.dateRange, summary, agentReports: rows, leadReport: leadSummary, customerReport: customerSummary, followUpReport: followUpSummary, charts: { conversionOverview, leadSourcePerformance: chart([...new Set(visibleLeads.map(item => item.lead_source))], item => item.lead_source), followUpStatusPerformance: REPORT_FOLLOWUP_STATUSES.map(status => ({ label: status, value: visibleFollowUps.filter(item => item.status === status).length })), agentConversionPerformance: rows.map(row => ({ label: row.agentName, value: row.conversionRate })) }, meta: { generatedAt: new Date().toISOString(), timezone: REPORT_TIMEZONE, currency: 'PKR' }, filters: { teams: [...new Set(scopedAgents.map(item => item.teamId).filter(Boolean))], agents: scopedAgents.map(item => ({ id: item.id, name: item.full_name, teamId: item.team_id })) } };
}
function reportAgentDetailFor(user, agentId, searchParams) { const response = reportResponseFor(user, new URLSearchParams([...searchParams.entries(), ['agentId', agentId]])); const agent = response.agentReports.find(item => item.agentId === agentId); if (!agent) return null; const leadRows = leads.filter(item => item.assigned_agent_id === agentId && reportInRange(item.created_at || item.updated_at, reportDateBounds(Object.fromEntries(searchParams.entries())))).map(item => ({ leadId: item.id, leadName: item.full_name, phone: item.phone, interestedIn: item.interested_in, leadSource: item.lead_source, status: item.status, createdAt: item.created_at, lastContactedAt: item.last_contacted_at, nextFollowUpAt: item.next_follow_up_at })); const customerRows = customers.filter(item => item.assigned_agent_id === agentId).map(item => ({ customerId: item.id, customerName: item.full_name, phone: item.phone, interestedIn: item.interested_in, customerStatus: item.customer_status, budget: item.budget, lastActivityAt: item.updated_at, nextFollowUpAt: item.next_follow_up_at })); const followUpRows = followUps.filter(item => item.assigned_agent_id === agentId).map(item => ({ followUpId: item.id, customerName: item.customer_name, followUpType: item.follow_up_type, dueDate: item.due_date, dueTime: item.due_time, priority: item.priority, status: item.status, completedAt: item.completed_at })); const activity = (userActivities.get(agentId) || []).map(item => ({ id: item.id, agentId, activityType: 'status_changed', description: item.description, createdAt: item.created_at })); return { agent, overview: { assignedLeads: agent.assignedLeads, contactedLeads: agent.contactedLeads, hotLeads: agent.hotLeads, followUpsCompleted: agent.followUpsCompleted, overdueFollowUps: agent.overdueFollowUps, customersHandled: agent.totalCustomers, closedDeals: agent.closedDeals, lostLeads: agent.lostLeads, conversionRate: agent.conversionRate }, leads: leadRows, customers: customerRows, followUps: followUpRows, activity }; }

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(pair => {
    const index = pair.indexOf('=');
    return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())];
  }));
}

function currentUser(req) {
  const token = parseCookies(req).aureum_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return users.find(user => user.id === session.userId) || null;
}

function requireAuth(req, res) {
  const user = currentUser(req);
  if (!user) { json(res, 401, { error: 'Authentication required' }); return null; }
  return user;
}

function requireRole(req, res, allowedRoles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!allowedRoles.includes(user.role)) { json(res, 403, { error: 'Access denied — insufficient permission' }); return null; }
  return user;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 100_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function staticFile(res, pathname) {
  const relative = pathname === '/' ? path.join('frontend', 'index.html') : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (!path.extname(filePath)) {
      const shell = path.join(ROOT, 'frontend', 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
      fs.createReadStream(shell).pipe(res);
      return;
    }
    res.writeHead(404); res.end('Not found'); return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  fs.createReadStream(filePath).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/')) { staticFile(res, url.pathname); return; }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const ip = req.socket.remoteAddress || 'local';
      const attempt = loginAttempts.get(ip) || { count: 0, firstAt: Date.now() };
      if (Date.now() - attempt.firstAt > 10 * 60 * 1000) { attempt.count = 0; attempt.firstAt = Date.now(); }
      if (attempt.count >= 8) { json(res, 429, { error: 'Too many login attempts. Please try again later.' }); return; }
      const body = await readBody(req);
      const identifier = String(body.identifier || '').trim().toLowerCase();
      const user = users.find(item => item.email.toLowerCase() === identifier || item.phone === identifier || (identifier === 'agent@aureum.com' && item.id === 'usr_003'));
      const supplied = passwordHash(String(body.password || ''));
      const valid = user && crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(user.password_hash, 'hex'));
      if (user?.has_temporary_password && user.temporary_password_expires_at && new Date(user.temporary_password_expires_at).getTime() < Date.now()) { user.invite_status = 'Expired'; json(res, 401, { error: 'Temporary password has expired. Please request new access.' }); return; }
      if (!valid || user.status !== 'active') { attempt.count += 1; loginAttempts.set(ip, attempt); json(res, 401, { error: user && user.status !== 'active' ? 'This account is not active.' : 'Invalid email/phone or password' }); return; }
      loginAttempts.delete(ip);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL });
      user.last_login_at = new Date().toISOString(); user.last_activity_at = user.last_login_at; addActivityLog(user.id, 'user', user.id, 'login_success', `${user.full_name} logged in to the workspace.`);
      json(res, 200, { user: publicUser(user), permissions: rolePermissions[user.role] }, { 'Set-Cookie': `aureum_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}` });
    } catch (error) { json(res, 400, { error: error.message }); }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req).aureum_session;
    if (token) sessions.delete(token);
    json(res, 200, { ok: true }, { 'Set-Cookie': 'aureum_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = requireAuth(req, res);
    if (user) json(res, 200, { user: publicUser(user), permissions: rolePermissions[user.role] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/permissions') {
    const user = requireAuth(req, res);
    if (user) json(res, 200, { role: user.role, permissions: rolePermissions[user.role] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users/me') {
    const user = requireAuth(req, res);
    if (user) json(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/account/me') {
    const user = requireAuth(req, res);
    if (user) json(res, 200, { user: userManagementView(user, user), timezone: CRM_TIMEZONE });
    return;
  }

  if ((req.method === 'GET' || req.method === 'PATCH') && url.pathname === '/api/account/me/profile') {
    const user = requireAuth(req, res);
    if (user) {
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        if (body.fullName !== undefined || body.full_name !== undefined) user.full_name = String(body.fullName ?? body.full_name).trim();
        if (body.phone !== undefined) user.phone = String(body.phone || '').trim();
        if (body.avatarUrl !== undefined || body.avatar_url !== undefined) user.avatar_url = String((body.avatarUrl ?? body.avatar_url) || '').trim();
        if (!user.full_name) { json(res, 422, { error: 'Full name is required.' }); return; }
        user.updated_at = new Date().toISOString(); user.last_activity_at = user.updated_at;
        addUserAudit(user.id, user.id, 'user_updated', 'Personal profile details updated.');
      }
      json(res, 200, { user: userManagementView(user, user) });
    }
    return;
  }

  const accountPreferenceMatch = url.pathname.match(/^\/api\/account\/preferences\/(notifications|appearance|display)$/);
  if (accountPreferenceMatch && (req.method === 'GET' || req.method === 'PATCH')) {
    const user = requireAuth(req, res);
    if (user) {
      const key = accountPreferenceMatch[1];
      const current = accountPreferences.get(user.id) || {};
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const allowed = key === 'notifications'
          ? ['new_lead_assigned', 'follow_up_due', 'follow_up_overdue', 'team_chat_message', 'daily_digest']
          : key === 'appearance' ? ['theme', 'compact_mode', 'sidebar_collapsed'] : ['language', 'date_format', 'time_format'];
        const next = { ...(current[key] || {}) };
        allowed.forEach(field => { if (body[field] !== undefined) next[field] = key === 'notifications' || key === 'appearance' && ['compact_mode', 'sidebar_collapsed'].includes(field) ? Boolean(body[field]) : String(body[field]); });
        if (key === 'appearance' && !['light', 'dark', 'system'].includes(next.theme)) { json(res, 422, { error: 'Unsupported appearance theme.' }); return; }
        current[key] = next; accountPreferences.set(user.id, current);
        addActivityLog(user.id, 'account', user.id, 'account_preferences_updated', `Personal ${key} preferences updated.`);
      }
      const data = accountPreferences.get(user.id) || {};
      json(res, 200, { data: { ...(data[key] || {}), ...(key === 'display' ? { timezone: CRM_TIMEZONE } : {}) } });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/account/login-activity') {
    const user = requireAuth(req, res);
    if (user) {
      const events = [
        { id: `${user.id}_login_current`, type: 'Successful sign-in', description: 'Current browser session', ipAddress: 'Local development session', createdAt: user.last_login_at || user.updated_at },
        ...(userActivities.get(user.id) || []).map(item => ({ id: item.id, type: item.activity_type, description: item.description, ipAddress: 'Workspace activity', createdAt: item.created_at }))
      ];
      json(res, 200, { data: events.slice(0, 20), timezone: CRM_TIMEZONE });
    }
    return;
  }

  if (req.method === 'PATCH' && url.pathname === '/api/account/me') {
    const user = requireAuth(req, res);
    if (user) { const body = await readBody(req); if (body.fullName !== undefined || body.full_name !== undefined) user.full_name = String(body.fullName || body.full_name).trim(); if (body.phone !== undefined) user.phone = String(body.phone || '').trim(); user.updated_at = new Date().toISOString(); user.last_activity_at = user.updated_at; addUserAudit(user.id, user.id, 'user_updated', 'Personal account profile updated.'); json(res, 200, { user: userManagementView(user, user) }); }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/account/change-password') {
    const user = requireAuth(req, res);
    if (user) { const body = await readBody(req); const current = String(body.currentPassword || body.current_password || ''); const next = String(body.newPassword || body.new_password || ''); const confirm = String(body.confirmPassword || body.confirm_password || ''); if (passwordHash(current) !== user.password_hash) { json(res, 400, { error: 'Current password is incorrect.' }); return; } if (next.length < 8 || !/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/[0-9]/.test(next) || !/[^A-Za-z0-9]/.test(next)) { json(res, 400, { error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.' }); return; } if (next !== confirm) { json(res, 400, { error: 'Passwords do not match.' }); return; } if (next === current) { json(res, 400, { error: 'New password must be different from current password.' }); return; } user.password_hash = passwordHash(next); user.must_change_password = false; user.has_temporary_password = false; user.temporary_password_expires_at = undefined; user.invite_status = 'Accepted'; user.invite_accepted_at = new Date().toISOString(); user.status = 'active'; user.updated_at = new Date().toISOString(); addUserAudit(user.id, user.id, 'password_changed', 'Password changed successfully.'); json(res, 200, { success: true, message: 'Password changed successfully.', mustChangePassword: false, user: userManagementView(user, user) }); }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/account/force-change-password') {
    const user = requireAuth(req, res);
    if (user) { user.must_change_password = true; user.has_temporary_password = true; addUserAudit(user.id, user.id, 'password_reset', 'Password change was required for the current account.'); json(res, 200, { success: true, mustChangePassword: true }); }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users/teams') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) json(res, 200, { data: userManagementTeams(user), timezone: CRM_TIMEZONE });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) { const query = String(url.searchParams.get('search') || '').toLowerCase(); const role = url.searchParams.get('role') || ''; const status = url.searchParams.get('status') || ''; const inviteStatus = url.searchParams.get('inviteStatus') || ''; const activityStatus = url.searchParams.get('activityStatus') || ''; const teamId = url.searchParams.get('teamId') || ''; const scoped = users.filter(target => userScopedTo(user, target)); const filtered = scoped.filter(target => (!query || [target.full_name, target.email, target.phone].some(value => String(value || '').toLowerCase().includes(query))) && (!role || target.role === role) && (!status || USER_STATUS_LABELS[target.status] === status || target.status === status.toLowerCase()) && (!inviteStatus || target.invite_status === inviteStatus) && (!activityStatus || userActivityStatus(target) === activityStatus) && (!teamId || target.team_id === teamId)); json(res, 200, { data: filtered.map(target => userManagementView(user, target)), teams: userManagementTeams(user), meta: { total: filtered.length, page: 1, pageSize: filtered.length || 25, totalPages: 1 }, timezone: CRM_TIMEZONE }); }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/users') {
    const actor = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (actor) { const body = await readBody(req); const role = String(body.role || 'sales_agent'); const teamId = body.teamId || body.team_id || (actor.role === 'sales_manager' ? actor.team_id : ''); if (!canCreateManagedUser(actor, role)) { json(res, 403, { error: 'You do not have permission to create this user.' }); return; } if (!canManageTeam(actor, teamId)) { json(res, 403, { error: 'Sales Managers can only assign users to their own team.' }); return; } const email = String(body.email || '').trim().toLowerCase(); if (!String(body.fullName || body.full_name || '').trim() || !email) { json(res, 400, { error: 'Full name and email are required.' }); return; } if (users.some(item => item.email === email)) { json(res, 409, { error: 'Email already exists.' }); return; } const now = new Date().toISOString(); const created = { id: `usr_${String(users.length + 1).padStart(3, '0')}`, full_name: String(body.fullName || body.full_name).trim(), email, phone: String(body.phone || '').trim(), password_hash: passwordHash(String(body.temporaryPassword || body.password || generateTemporaryPassword())), role, team_id: teamId || null, status: normalizeUserStatus(body.status || 'Pending'), invite_status: 'Pending', activity_status: 'Offline', must_change_password: body.requirePasswordChangeOnFirstLogin !== false, has_temporary_password: true, temporary_password_expires_at: temporaryPasswordExpiry(), created_by: actor.id, created_by_name: actor.full_name, created_at: now, updated_at: now, last_activity_at: now }; users.push(created); addUserAudit(created.id, actor.id, 'user_created', `${created.full_name} was added to the workspace.`); let emailResult; if (body.sendAccessEmail !== false) emailResult = sendUserAccessEmail(actor, created); json(res, 201, { user: userManagementView(actor, created), email: emailResult || { success: false, status: 'draft', message: 'Access email not requested.' } }); }
    return;
  }

  const managedUserMatch = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/(status|send-access-email|resend-access-email|reset-password|audit-log))?$/);
  if (managedUserMatch) {
    const actor = requireRole(req, res, ['super_admin', 'sales_manager']); const target = users.find(item => item.id === managedUserMatch[1]); const action = managedUserMatch[2];
    if (!target) { json(res, 404, { error: 'User not found.' }); return; }
    if (!userScopedTo(actor, target)) { json(res, 403, { error: 'You do not have permission to manage this user.' }); return; }
    if (req.method === 'GET' && action === 'audit-log') { json(res, 200, { data: (userAuditLogs.get(target.id) || []).map(userAuditView).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) }); return; }
    if (req.method === 'GET' && !action) { json(res, 200, userDetailPayload(actor, target)); return; }
    if (req.method === 'POST' && ['send-access-email', 'resend-access-email', 'reset-password'].includes(action)) { json(res, 200, { user: userManagementView(actor, target), email: sendUserAccessEmail(actor, target, action === 'reset-password' ? 'password_reset' : 'access_email_sent') }); return; }
    if (req.method === 'PATCH' && action === 'status') { const body = await readBody(req); const nextStatus = normalizeUserStatus(body.status); target.status = nextStatus; target.updated_at = new Date().toISOString(); addUserAudit(target.id, actor.id, 'status_changed', `${target.full_name} status changed to ${USER_STATUS_LABELS[nextStatus]}.`); json(res, 200, { user: userManagementView(actor, target) }); return; }
    if (req.method === 'PATCH' && !action) { const body = await readBody(req); const previousRole = target.role; const previousTeam = target.team_id; const nextRole = body.role || target.role; const nextTeam = body.teamId || body.team_id || target.team_id; if (!canCreateManagedUser(actor, nextRole) || !canManageTeam(actor, nextTeam)) { json(res, 403, { error: 'You do not have permission to apply these user changes.' }); return; } ['fullName', 'full_name', 'phone'].forEach(field => { if (body[field] !== undefined) target[field === 'fullName' ? 'full_name' : field] = String(body[field] || '').trim(); }); target.role = nextRole; target.team_id = nextTeam || null; if (body.status !== undefined) target.status = normalizeUserStatus(body.status); target.updated_at = new Date().toISOString(); if (previousRole !== target.role) addUserAudit(target.id, actor.id, 'role_changed', `${target.full_name} role changed to ${USER_ROLE_LABELS[target.role]}.`); if (previousTeam !== target.team_id) addUserAudit(target.id, actor.id, 'team_changed', `${target.full_name} team assignment changed.`); addUserAudit(target.id, actor.id, 'user_updated', `${target.full_name} profile was updated.`); json(res, 200, { user: userManagementView(actor, target) }); return; }
    json(res, 405, { error: 'Method not allowed.' }); return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users/me') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) json(res, 200, { users: users.filter(item => user.role === 'super_admin' || item.team_id === user.team_id).map(publicUser) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/users') {
    const user = requireRole(req, res, ['super_admin']);
    if (user) {
      const body = await readBody(req); const role = body.role;
      if (!body.full_name || !body.email || !body.password || !rolePermissions[role]) { json(res, 400, { error: 'Full name, email, password, and a valid role are required' }); return; }
      if (users.some(item => item.email.toLowerCase() === String(body.email).toLowerCase())) { json(res, 409, { error: 'Email already exists' }); return; }
      const created = { id: `usr_${String(users.length + 1).padStart(3, '0')}`, full_name: body.full_name, email: String(body.email).toLowerCase(), phone: body.phone || '', password_hash: passwordHash(body.password), role, team_id: body.team_id || null, status: body.status || 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      users.push(created); json(res, 201, { user: publicUser(created) });
    }
    return;
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/(status))?$/);
  if (userMatch && req.method === 'PATCH') {
    const actor = requireRole(req, res, ['super_admin']);
    if (actor) { const target = users.find(item => item.id === userMatch[1]); if (!target) { json(res, 404, { error: 'User not found' }); return; } const body = await readBody(req); if (userMatch[2] === 'status') target.status = body.status || target.status; else { ['full_name', 'email', 'phone', 'role', 'team_id', 'status'].forEach(field => { if (body[field] !== undefined) target[field] = body[field]; }); if (body.password) target.password_hash = passwordHash(body.password); } target.updated_at = new Date().toISOString(); json(res, 200, { user: publicUser(target) }); }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/leads') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) {
      let data = [...leads];
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const status = url.searchParams.get('status');
      const source = url.searchParams.get('source');
      const agentId = url.searchParams.get('agentId');
      if (q) data = data.filter(lead => [lead.full_name, lead.phone, lead.whatsapp_number, lead.email, lead.city].some(value => String(value || '').toLowerCase().includes(q)));
      if (status) data = data.filter(lead => lead.status === status);
      if (source) data = data.filter(lead => lead.lead_source === source);
      if (agentId) data = data.filter(lead => lead.assigned_agent_id === agentId);
      json(res, 200, { scope: 'all', requestedBy: user.role, data: data.map(leadView) });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/leads/my') {
    const user = requireAuth(req, res);
    if (user) json(res, 200, { scope: 'my', requestedBy: user.role, data: leads.filter(lead => lead.assigned_agent_id === user.id).map(leadView) });
    return;
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (req.method === 'GET' && leadMatch) {
    const user = requireAuth(req, res);
    const lead = findLead(leadMatch[1]);
    if (!lead) { json(res, 404, { error: 'Lead not found' }); return; }
    if (user && canViewLead(user, lead)) json(res, 200, { data: leadView(lead) });
    else if (user) json(res, 403, { error: 'Access denied — lead is outside your ownership scope' });
    return;
  }

  if (req.method === 'PATCH' && leadMatch) {
    const user = requireAuth(req, res);
    const lead = findLead(leadMatch[1]);
    if (!lead) { json(res, 404, { error: 'Lead not found' }); return; }
    if (!user || !canViewLead(user, lead)) { if (user) json(res, 403, { error: 'Access denied — lead is outside your ownership scope' }); return; }
    const body = await readBody(req);
    const editable = ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'financing_required', 'lead_source', 'priority', 'next_follow_up_at'];
    editable.forEach(field => { if (body[field] !== undefined) lead[field] = body[field]; });
    if (body.tags) lead.tags = body.tags;
    lead.updated_at = new Date().toISOString().slice(0, 10); addLeadActivity(lead.id, user.id, 'Lead updated', 'Lead details updated'); json(res, 200, { data: leadView(lead) }); return;
  }

  if (req.method === 'POST' && url.pathname === '/api/leads') {
    const user = requireRole(req, res, ['sales_manager']);
    if (user) {
      try {
        const body = await readBody(req);
        if (!body.full_name || !body.phone || !body.interested_in) { json(res, 400, { error: 'Full name, phone, and interested in are required' }); return; }
        const assigned = users.find(item => item.id === body.assigned_agent_id && item.status === 'active');
        const lead = { id: `lead_${String(leads.length + 1).padStart(3, '0')}`, full_name: body.full_name, initials: body.full_name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase(), phone: body.phone, whatsapp_number: body.whatsapp_number || body.phone, email: body.email || '', city: body.city || '', area: body.area || '', interested_in: body.interested_in, property_type: body.property_type || '', budget: body.budget || '', preferred_location: body.preferred_location || '', purpose: body.purpose || '', buying_timeline: body.buying_timeline || '', financing_required: Boolean(body.financing_required), lead_source: body.lead_source || 'Manual Entry', status: body.status || 'New', priority: body.priority || 'Medium', tags: Array.isArray(body.tags) ? body.tags : [], assigned_agent_id: assigned?.id || null, assigned_agent: assigned?.full_name || 'Unassigned', assigned_team_id: assigned?.team_id || null, created_by: user.id, last_contacted_at: 'Not contacted', next_follow_up_at: body.next_follow_up_at || 'Not scheduled', created_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString().slice(0, 10) };
        leads.unshift(lead); leadActivities.set(lead.id, []); addLeadActivity(lead.id, user.id, 'Lead created', `Lead created by ${user.full_name}`); json(res, 201, { data: leadView(lead) });
      } catch (error) { json(res, 400, { error: error.message }); }
    }
    return;
  }

  const leadActionMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/(assign|status|notes|tags|activity)$/);
  if (leadActionMatch) {
    const user = requireAuth(req, res);
    const lead = findLead(leadActionMatch[1]);
    const action = leadActionMatch[2];
    if (!lead) { json(res, 404, { error: 'Lead not found' }); return; }
    if (!user || !canViewLead(user, lead)) { if (user) json(res, 403, { error: 'Access denied — lead is outside your ownership scope' }); return; }
    if (req.method === 'GET' && action === 'activity') { json(res, 200, { data: leadActivities.get(lead.id) || [] }); return; }
    if (req.method === 'PATCH' && action === 'assign') {
      if (!['super_admin', 'sales_manager'].includes(user.role)) { json(res, 403, { error: 'Only managers can assign leads' }); return; }
      const body = await readBody(req); const assigned = users.find(item => item.id === body.assigned_agent_id && ['sales_agent', 'sales_manager'].includes(item.role) && item.status === 'active');
      if (!assigned) { json(res, 400, { error: 'A valid active advisor is required' }); return; }
      lead.assigned_agent_id = assigned.id; lead.assigned_agent = assigned.full_name; lead.assigned_team_id = assigned.team_id; lead.updated_at = new Date().toISOString().slice(0, 10); addLeadActivity(lead.id, user.id, 'Lead assigned', `Lead assigned to ${assigned.full_name}`); json(res, 200, { data: leadView(lead) }); return;
    }
    if (req.method === 'PATCH' && action === 'status') {
      const body = await readBody(req); const oldStatus = lead.status; lead.status = body.status || lead.status; lead.priority = body.priority || lead.priority; lead.updated_at = new Date().toISOString().slice(0, 10); if (oldStatus !== lead.status) addLeadActivity(lead.id, user.id, 'Status changed', `${oldStatus} → ${lead.status}`); json(res, 200, { data: leadView(lead) }); return;
    }
    if (req.method === 'POST' && action === 'notes') {
      const body = await readBody(req); if (!body.note) { json(res, 400, { error: 'Note is required' }); return; } addLeadActivity(lead.id, user.id, 'Note added', body.note); json(res, 201, { data: leadActivities.get(lead.id)[0] }); return;
    }
    if (req.method === 'POST' && action === 'tags') {
      const body = await readBody(req); if (body.tag && !lead.tags.includes(body.tag)) lead.tags.push(body.tag); addLeadActivity(lead.id, user.id, 'Tag added', body.tag || 'Tag updated'); json(res, 201, { data: leadView(lead) }); return;
    }
    json(res, 405, { error: 'Method not allowed' }); return;
  }

  if (req.method === 'GET' && url.pathname === '/api/customers') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) {
      let data = customers.filter(customer => canViewCustomer(user, customer));
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const status = url.searchParams.get('status');
      const source = url.searchParams.get('source');
      if (q) data = data.filter(customer => [customer.full_name, customer.phone, customer.whatsapp_number, customer.email, customer.city].some(value => String(value || '').toLowerCase().includes(q)));
      if (status) data = data.filter(customer => customer.customer_status === status);
      if (source) data = data.filter(customer => customer.lead_source === source);
      json(res, 200, { scope: user.role === 'super_admin' ? 'company' : 'team', data: data.map(customerView), meta: { total: data.length, page: 1, pageSize: data.length, totalPages: data.length ? 1 : 0 } });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/customers/my') {
    const user = requireAuth(req, res);
    if (user) json(res, 200, { scope: 'assigned', data: customers.filter(customer => customer.assigned_agent_id === user.id).map(customerView) });
    return;
  }

  const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && req.method === 'GET') {
    const user = requireAuth(req, res); const customer = customers.find(item => item.id === customerMatch[1]);
    if (!customer) { json(res, 404, { error: 'Customer not found' }); return; }
    if (!canViewCustomer(user, customer)) { json(res, 403, { error: 'Access denied — customer is outside your ownership scope' }); return; }
    json(res, 200, { data: customerView(customer), notes: customerNotes.get(customer.id) || [], timeline: customerActivities.get(customer.id) || [], followUps: customerFollowUps.get(customer.id) || [] }); return;
  }

  const customerStatusMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/status$/);
  if (customerStatusMatch && req.method === 'PATCH') {
    const user = requireAuth(req, res); const customer = customers.find(item => item.id === customerStatusMatch[1]);
    if (!customer) { json(res, 404, { error: 'Customer not found' }); return; }
    if (!canViewCustomer(user, customer)) { json(res, 403, { error: 'Access denied — customer is outside your ownership scope' }); return; }
    const body = await readBody(req); const allowedStatuses = ['Active', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Booking Interested', 'Closed Won', 'Closed Lost', 'Not Interested']; if (body.status && !allowedStatuses.includes(body.status)) { json(res, 400, { error: 'Invalid customer status' }); return; } const previous = customer.customer_status; customer.customer_status = body.status || previous; addCustomerActivity(customer.id, user.id, 'Status changed', `${previous} → ${customer.customer_status}`); json(res, 200, { data: customerView(customer) }); return;
  }

  const customerActionMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/(notes|timeline|follow-ups)$/);
  if (customerActionMatch) {
    const user = requireAuth(req, res); const customer = customers.find(item => item.id === customerActionMatch[1]); const action = customerActionMatch[2];
    if (!customer) { json(res, 404, { error: 'Customer not found' }); return; }
    if (!canViewCustomer(user, customer)) { json(res, 403, { error: 'Access denied — customer is outside your ownership scope' }); return; }
    if (action === 'timeline' && req.method === 'GET') { json(res, 200, { data: customerActivities.get(customer.id) || [] }); return; }
    if (action === 'notes' && req.method === 'GET') { json(res, 200, { data: customerNotes.get(customer.id) || [] }); return; }
    if (action === 'notes' && req.method === 'POST') { const body = await readBody(req); if (!body.note) { json(res, 400, { error: 'Note is required' }); return; } const note = { id: crypto.randomUUID(), note: body.note, user_id: user.id, created_at: new Date().toISOString() }; customerNotes.set(customer.id, [note, ...(customerNotes.get(customer.id) || [])]); addCustomerActivity(customer.id, user.id, 'Note added', body.note); json(res, 201, { data: note }); return; }
    if (action === 'follow-ups' && req.method === 'GET') { json(res, 200, { data: customerFollowUps.get(customer.id) || [] }); return; }
    if (action === 'follow-ups' && req.method === 'POST') { const body = await readBody(req); const rawDue = String(body.due_date || ''); const dateMatch = rawDue.match(/\d{4}-\d{2}-\d{2}/); const timeMatch = rawDue.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); let dueDate = dateMatch?.[0] || new Date().toISOString().slice(0, 10); if (!dateMatch && /tomorrow/i.test(rawDue)) { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); dueDate = tomorrow.toISOString().slice(0, 10); } const dueTime = timeMatch ? `${String((Number(timeMatch[1]) + (timeMatch[3]?.toUpperCase() === 'PM' && Number(timeMatch[1]) < 12 ? 12 : 0)).toString().padStart(2, '0'))}:${timeMatch[2]}` : '10:00'; const followUp = { id: crypto.randomUUID(), type: body.type || 'Phone call', due_date: body.due_date || 'Not scheduled', agent: customer.assigned_agent, status: 'Pending', note: body.note || '' }; customerFollowUps.set(customer.id, [followUp, ...(customerFollowUps.get(customer.id) || [])]); customer.next_follow_up_at = followUp.due_date; const primary = { id: `followup_${String(followUps.length + 1).padStart(3, '0')}`, customer_id: customer.id, lead_id: customer.lead_id, created_by: user.id, follow_up_type: body.type || 'General Follow-up', due_date: dueDate, due_time: dueTime, priority: body.priority || 'Medium', status: 'Pending', notes: body.note || '', customer_name: customer.full_name, customer_phone: customer.phone, assigned_agent_id: customer.assigned_agent_id, assigned_agent: customer.assigned_agent, assigned_team_id: customer.assigned_team_id, lead_status: customer.customer_status, last_activity: customer.last_contacted_at || 'Not contacted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; followUps.unshift(primary); followUpActivities.set(primary.id, []); addFollowUpActivity(primary, user.id, 'Follow-up scheduled', `${primary.follow_up_type} · ${primary.due_date} at ${primary.due_time}`); addCustomerActivity(customer.id, user.id, 'Follow-up scheduled', `${followUp.type} · ${followUp.due_date}`); json(res, 201, { data: followUp, followUp: followUpView(primary) }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }

  if (customerMatch && req.method === 'PATCH') {
    const user = requireAuth(req, res); const customer = customers.find(item => item.id === customerMatch[1]);
    if (!customer) { json(res, 404, { error: 'Customer not found' }); return; }
    if (!canViewCustomer(user, customer)) { json(res, 403, { error: 'Access denied — customer is outside your ownership scope' }); return; }
    const body = await readBody(req); const editable = ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'preferred_contact_method', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'financing_required', 'tags'];
    editable.forEach(field => { if (body[field] !== undefined) customer[field] = body[field]; });
    addCustomerActivity(customer.id, user.id, 'Customer updated', 'Customer profile details updated'); json(res, 200, { data: customerView(customer) }); return;
  }

  if (req.method === 'GET' && url.pathname === '/api/chat/users') {
    const user = requireAuth(req, res); if (user) { const visible = user.role === 'sales_manager' ? users.filter(target => target.team_id === user.team_id || target.id === user.id) : users; json(res, 200, { data: visible.filter(target => target.id !== user.id).map(target => ({ ...chatUserView(target), team_id: target.team_id, team_name: target.team_id === 'team_a' ? 'Sales Team A' : target.team_id === 'team_b' ? 'Sales Team B' : 'Leadership' })) }); } return;
  }
  if (req.method === 'GET' && url.pathname === '/api/chat/groups') {
    const user = requireAuth(req, res); if (user) json(res, 200, { data: groupChats.filter(group => canAccessGroup(user, group)).map(group => groupView(user, group)) }); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/chat/groups') {
    const actor = requireAuth(req, res); if (!actor) return;
    if (!canCreateGroup(actor)) { json(res, 403, { error: 'Sales Agents cannot create group chats' }); return; }
    const body = await readBody(req); const groupName = String(body.groupName || '').trim(); const requestedMembers = Array.isArray(body.memberIds) ? body.memberIds : [];
    if (!groupName) { json(res, 400, { error: 'Group name is required' }); return; }
    const uniqueMembers = [...new Set([actor.id, ...requestedMembers])]; const selectedUsers = uniqueMembers.map(id => users.find(item => item.id === id));
    if (selectedUsers.some(item => !item)) { json(res, 400, { error: 'One or more selected users are invalid' }); return; }
    if (actor.role === 'sales_manager' && selectedUsers.some(item => !canAddGroupMember(actor, item))) { json(res, 403, { error: 'Managers can only add users from their own team' }); return; }
    const group = { id: `group_${crypto.randomUUID().slice(0, 8)}`, group_name: groupName, description: String(body.description || '').trim(), created_by: actor.id, member_ids: uniqueMembers, is_archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    groupChats.push(group); groupMessages.set(group.id, [{ id: crypto.randomUUID(), group_id: group.id, sender_id: actor.id, message_type: 'system', message_text: `Group created by ${actor.full_name}.`, created_at: new Date().toISOString() }]);
    addActivityLog(actor.id, 'team_chat_group', group.id, 'Group created', `${group.group_name} created by ${actor.full_name}.`); json(res, 201, { data: groupView(actor, group), event: 'group_created' }); return;
  }
  const groupMatch = url.pathname.match(/^\/api\/chat\/groups\/([^/]+)$/);
  if (groupMatch) {
    const user = requireAuth(req, res); const group = groupChats.find(item => item.id === groupMatch[1]);
    if (!user) return;
    if (!group) { json(res, 404, { error: 'Group chat not found' }); return; }
    if (!canAccessGroup(user, group)) { json(res, 403, { error: 'You do not have access to this group' }); return; }
    if (req.method === 'PATCH') { if (!canManageGroup(user, group)) { json(res, 403, { error: 'You do not have permission to manage this group' }); return; } const body = await readBody(req); if (body.groupName !== undefined && !String(body.groupName).trim()) { json(res, 400, { error: 'Group name cannot be empty' }); return; } if (body.groupName !== undefined) group.group_name = String(body.groupName).trim(); if (body.description !== undefined) group.description = String(body.description).trim(); group.updated_at = new Date().toISOString(); json(res, 200, { data: groupView(user, group), event: 'group_updated' }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }
  const groupMembersMatch = url.pathname.match(/^\/api\/chat\/groups\/([^/]+)\/members(?:\/([^/]+))?$/);
  if (groupMembersMatch) {
    const user = requireAuth(req, res); const group = groupChats.find(item => item.id === groupMembersMatch[1]);
    if (!user) return;
    if (!group) { json(res, 404, { error: 'Group chat not found' }); return; }
    if (!canAccessGroup(user, group)) { json(res, 403, { error: 'You do not have access to this group' }); return; }
    if (!canManageGroup(user, group)) { json(res, 403, { error: 'You do not have permission to manage members' }); return; }
    if (req.method === 'POST') { const body = await readBody(req); const memberIds = Array.isArray(body.memberIds) ? body.memberIds : []; const selectedUsers = memberIds.map(id => users.find(item => item.id === id)); if (selectedUsers.some(item => !item || !canAddGroupMember(user, item))) { json(res, 403, { error: 'One or more members are outside your permitted scope' }); return; } group.member_ids = [...new Set([...group.member_ids, ...memberIds])]; group.updated_at = new Date().toISOString(); json(res, 200, { data: groupView(user, group), event: 'member_added' }); return; }
    if (req.method === 'DELETE' && groupMembersMatch[2]) { const removeId = groupMembersMatch[2]; if (removeId === group.created_by) { json(res, 400, { error: 'The group owner cannot be removed' }); return; } group.member_ids = group.member_ids.filter(id => id !== removeId); group.updated_at = new Date().toISOString(); json(res, 200, { data: groupView(user, group), event: 'member_removed' }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }
  const groupArchiveMatch = url.pathname.match(/^\/api\/chat\/groups\/([^/]+)\/archive$/);
  if (groupArchiveMatch && req.method === 'PATCH') {
    const user = requireAuth(req, res); if (!user) return; const group = groupChats.find(item => item.id === groupArchiveMatch[1]); if (!group) { json(res, 404, { error: 'Group chat not found' }); return; } if (!canManageGroup(user, group)) { json(res, 403, { error: 'You do not have permission to archive this group' }); return; } group.is_archived = true; group.updated_at = new Date().toISOString(); json(res, 200, { data: groupView(user, group), event: 'group_archived' }); return;
  }
  const groupMessagesMatch = url.pathname.match(/^\/api\/chat\/groups\/([^/]+)\/messages$/);
  if (groupMessagesMatch) {
    const user = requireAuth(req, res); if (!user) return; const group = groupChats.find(item => item.id === groupMessagesMatch[1]); if (!group) { json(res, 404, { error: 'Group chat not found' }); return; } if (!canAccessGroup(user, group)) { json(res, 403, { error: 'You do not have access to this group' }); return; }
    if (req.method === 'GET') { json(res, 200, { data: (groupMessages.get(group.id) || []).map(chatMessageView) }); return; }
    if (req.method === 'POST') { const body = await readBody(req); if (!body.message_text && !body.attachment_name) { json(res, 400, { error: 'Message text or attachment is required' }); return; } const message = { id: crypto.randomUUID(), group_id: group.id, sender_id: user.id, message_type: body.attachment_name ? 'attachment' : 'text', message_text: body.message_text || '', attachment_name: body.attachment_name || '', attachment_url: body.attachment_url || '', created_at: new Date().toISOString() }; groupMessages.set(group.id, [...(groupMessages.get(group.id) || []), message]); group.updated_at = message.created_at; if (message.attachment_name) { const files = chatAttachments.get(group.id) || []; files.push({ id: crypto.randomUUID(), chat_id: group.id, message_id: message.id, file_name: message.attachment_name, file_type: 'other', file_size: body.attachment_size || 'Pending upload', uploaded_by: user.id, uploaded_at: message.created_at }); chatAttachments.set(group.id, files); } json(res, 201, { data: chatMessageView(message), event: 'message:new' }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }
  const chatAssetsMatch = url.pathname.match(/^\/api\/chat\/([^/]+)\/(attachments|links)$/);
  if (chatAssetsMatch && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return; const chatId = chatAssetsMatch[1]; const channel = chatChannels.find(item => item.id === chatId); const group = groupChats.find(item => item.id === chatId); if (channel && !canViewChannel(user, channel)) { json(res, 403, { error: 'You do not have access to this channel' }); return; } if (group && !canAccessGroup(user, group)) { json(res, 403, { error: 'You do not have access to this group' }); return; } if (!channel && !group) { json(res, 404, { error: 'Chat not found' }); return; } json(res, 200, { data: chatAssetsMatch[2] === 'attachments' ? (chatAttachments.get(chatId) || []).map(chatAttachmentView) : (chatLinks.get(chatId) || []).map(chatLinkView) }); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/chat/channels') {
    const user = requireAuth(req, res); if (user) { const unread = { channel_general: 0, channel_sales: 4, channel_announcements: 0, channel_followups: 2, channel_bookings: 0, channel_management: 1 }; json(res, 200, { data: chatChannels.filter(channel => canViewChannel(user, channel)).map(channel => ({ ...channel, unread: unread[channel.id] || 0, memberCount: channel.members.length, memberIds: channel.members })) }); } return;
  }
  const chatChannelMessagesMatch = url.pathname.match(/^\/api\/chat\/channels\/([^/]+)\/messages$/);
  if (chatChannelMessagesMatch) {
    const user = requireAuth(req, res); const channel = chatChannels.find(item => item.id === chatChannelMessagesMatch[1]);
    if (!user) return;
    if (!channel) { json(res, 404, { error: 'Channel not found' }); return; }
    if (!canViewChannel(user, channel)) { json(res, 403, { error: 'Access denied — private channel' }); return; }
    if (req.method === 'GET') { json(res, 200, { data: (chatMessages.get(channel.id) || []).map(chatMessageView) }); return; }
    if (req.method === 'POST') { const body = await readBody(req); if (!body.message_text && !body.attachment_name) { json(res, 400, { error: 'Message text or attachment is required' }); return; } const message = { id: crypto.randomUUID(), channel_id: channel.id, sender_id: user.id, message_type: body.attachment_name ? 'file' : 'text', message_text: body.message_text || '', attachment_name: body.attachment_name || '', attachment_url: body.attachment_url || '', created_at: new Date().toISOString() }; chatMessages.set(channel.id, [...(chatMessages.get(channel.id) || []), message]); json(res, 201, { data: chatMessageView(message), event: 'message:new' }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/chat/direct') {
    const user = requireAuth(req, res); if (user) { const data = users.filter(target => target.id !== user.id && canMessageUser(user, target)).map(target => { const messages = directMessages.get(directKey(user.id, target.id)) || []; const last = messages[messages.length - 1]; return { user: chatUserView(target), lastMessage: last?.message_text || 'Start a conversation', lastMessageAt: last?.created_at || '', unread: messages.filter(item => item.receiver_id === user.id && !item.read_at).length }; }); json(res, 200, { data }); } return;
  }
  const directMessagesMatch = url.pathname.match(/^\/api\/chat\/direct\/([^/]+)\/messages$/);
  if (directMessagesMatch) {
    const user = requireAuth(req, res); const target = users.find(item => item.id === directMessagesMatch[1]);
    if (!user) return;
    if (!target) { json(res, 404, { error: 'User not found' }); return; }
    if (!canMessageUser(user, target)) { json(res, 403, { error: 'Access denied — direct message scope' }); return; }
    const key = directKey(user.id, target.id);
    if (req.method === 'GET') { const messages = directMessages.get(key) || []; messages.filter(item => item.receiver_id === user.id).forEach(item => { item.read_at = item.read_at || new Date().toISOString(); }); json(res, 200, { data: messages.map(chatMessageView) }); return; }
    if (req.method === 'POST') { const body = await readBody(req); if (!body.message_text && !body.attachment_name) { json(res, 400, { error: 'Message text or attachment is required' }); return; } const message = { id: crypto.randomUUID(), sender_id: user.id, receiver_id: target.id, message_type: body.attachment_name ? 'file' : 'text', message_text: body.message_text || '', attachment_name: body.attachment_name || '', attachment_url: body.attachment_url || '', created_at: new Date().toISOString(), read_at: null }; directMessages.set(key, [...(directMessages.get(key) || []), message]); json(res, 201, { data: chatMessageView(message), event: 'message:new' }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/chat/attachments') { const user = requireAuth(req, res); if (user) { const body = await readBody(req); if (!body.attachment_name) { json(res, 400, { error: 'Attachment name is required' }); return; } json(res, 201, { data: { id: crypto.randomUUID(), attachment_name: body.attachment_name, attachment_url: body.attachment_url || '', uploaded_by: user.id, created_at: new Date().toISOString() } }); } return; }
  if (req.method === 'PATCH' && url.pathname.match(/^\/api\/chat\/messages\/([^/]+)\/read$/)) { const user = requireAuth(req, res); if (user) json(res, 200, { ok: true, read_at: new Date().toISOString() }); return; }
  if (req.method === 'GET' && url.pathname === '/api/chat/unread-counts') { const user = requireAuth(req, res); if (user) { const channels = { channel_general: 0, channel_sales: 4, channel_announcements: 0, channel_followups: 2, channel_bookings: 0, channel_management: user.role === 'sales_agent' ? 0 : 1 }; const direct = {}; const total = Object.values(channels).reduce((sum, value) => sum + value, 0); json(res, 200, { data: { total, channels, direct } }); } return; }

  if (req.method === 'GET' && url.pathname === '/api/reports/summary') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) { const report = reportResponseFor(user, url.searchParams); json(res, 200, { scope: report.scope, data: report.summary, meta: report.meta }); } return;
  }
  if (req.method === 'GET' && url.pathname === '/api/reports/agents') { const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) { const report = reportResponseFor(user, url.searchParams); json(res, 200, { data: report.agentReports, meta: report.meta }); } return; }
  const reportAgentDetailMatch = url.pathname.match(/^\/api\/reports\/agents\/([^/]+)$/);
  if (reportAgentDetailMatch && req.method === 'GET') { const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) { const detail = reportAgentDetailFor(user, reportAgentDetailMatch[1], url.searchParams); if (!detail) { json(res, 404, { error: 'Agent report not found in your permitted scope' }); return; } json(res, 200, { data: detail }); } return; }
  const reportAgentMatch = url.pathname.match(/^\/api\/reports\/agents\/([^/]+)(?:\/(leads|follow-ups|customers|activity))?$/);
  if (reportAgentMatch && req.method === 'GET') { const user = requireRole(req, res, ['super_admin', 'sales_manager']); const target = users.find(item => item.id === reportAgentMatch[1]); if (!target) { json(res, 404, { error: 'Agent not found' }); return; } if (!agentInScope(user, target)) { json(res, 403, { error: 'Access denied — agent is outside your reporting scope' }); return; } const tab = reportAgentMatch[2]; if (tab === 'leads') { json(res, 200, { data: leads.filter(item => item.assigned_agent_id === target.id).map(leadView) }); return; } if (tab === 'follow-ups') { json(res, 200, { data: followUps.filter(item => item.assigned_agent_id === target.id).map(followUpView) }); return; } if (tab === 'customers') { json(res, 200, { data: customers.filter(item => item.assigned_agent_id === target.id).map(customerView) }); return; } if (tab === 'activity') { json(res, 200, { data: userActivities.get(target.id) || [] }); return; } json(res, 200, { data: agentView(user, target) }); return; }
  if (req.method === 'GET' && url.pathname.match(/^\/api\/reports\/export\/(pdf|excel)$/)) { const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) { const rows = reportRowsFor(user); const csv = ['Agent,Role,Assigned Leads,Follow-ups Completed,Overdue Follow-ups,Closed Deals,Conversion Rate', ...rows.map(row => [row.name, row.role, row.assignedLeads, row.followUpsCompleted, row.overdueFollowUps, row.closedDeals, row.conversionRate].join(','))].join('\n'); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="aureum-agent-report.csv"' }); res.end(csv); } return; }

  if (req.method === 'GET' && url.pathname === '/api/agents') { const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) json(res, 200, { data: reportUsersFor(user).map(target => agentView(user, target)) }); return; }
  if (req.method === 'POST' && url.pathname === '/api/agents') { const actor = requireRole(req, res, ['super_admin', 'sales_manager']); if (actor) { const body = await readBody(req); const role = body.role || 'sales_agent'; if (!body.full_name || !body.email || !body.password || !['sales_agent', 'sales_manager'].includes(role) || (actor.role === 'sales_manager' && role !== 'sales_agent')) { json(res, 400, { error: 'Name, email, password, and an allowed role are required' }); return; } if (users.some(item => item.email === String(body.email).toLowerCase())) { json(res, 409, { error: 'Email already exists' }); return; } const created = { id: `usr_${String(users.length + 1).padStart(3, '0')}`, full_name: body.full_name, email: String(body.email).toLowerCase(), phone: body.phone || '', password_hash: passwordHash(body.password), role, team_id: actor.role === 'sales_manager' ? actor.team_id : body.team_id || null, status: body.status || 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; users.push(created); userActivities.set(created.id, [{ id: crypto.randomUUID(), activity_type: 'Agent created', description: `${created.full_name} added to the workspace.`, created_at: new Date().toISOString() }]); json(res, 201, { data: agentView(actor, created) }); } return; }
  const agentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)(?:\/(status|team|leads|follow-ups|customers|activity))?$/);
  if (agentMatch) { const actor = requireRole(req, res, ['super_admin', 'sales_manager']); const target = users.find(item => item.id === agentMatch[1]); if (!target) { json(res, 404, { error: 'Agent not found' }); return; } if (!agentInScope(actor, target)) { json(res, 403, { error: 'Access denied — agent is outside your management scope' }); return; } const action = agentMatch[2]; if (req.method === 'GET') { if (action === 'leads') { json(res, 200, { data: leads.filter(item => item.assigned_agent_id === target.id).map(leadView) }); return; } if (action === 'follow-ups') { json(res, 200, { data: followUps.filter(item => item.assigned_agent_id === target.id).map(followUpView) }); return; } if (action === 'customers') { json(res, 200, { data: customers.filter(item => item.assigned_agent_id === target.id).map(customerView) }); return; } if (action === 'activity') { json(res, 200, { data: userActivities.get(target.id) || [] }); return; } json(res, 200, { data: agentView(actor, target) }); return; } if (req.method === 'PATCH') { const body = await readBody(req); if (action === 'status') target.status = body.status || target.status; else if (action === 'team') { if (actor.role !== 'super_admin') { json(res, 403, { error: 'Only Super Admin can change teams' }); return; } target.team_id = body.team_id || null; } else { if (actor.role === 'sales_manager' && (target.role !== 'sales_agent' || body.role === 'super_admin')) { json(res, 403, { error: 'Managers can only edit team sales agents' }); return; } ['full_name', 'email', 'phone', 'role', 'team_id', 'status'].forEach(field => { if (body[field] !== undefined) target[field] = body[field]; }); if (body.password) target.password_hash = passwordHash(body.password); } target.updated_at = new Date().toISOString(); userActivities.set(target.id, [{ id: crypto.randomUUID(), activity_type: 'Agent updated', description: `${target.full_name} profile was updated.`, created_at: new Date().toISOString() }, ...(userActivities.get(target.id) || [])]); json(res, 200, { data: agentView(actor, target) }); return; } json(res, 405, { error: 'Method not allowed' }); return; }

  if (req.method === 'GET' && url.pathname === '/api/search') {
    const user = requireAuth(req, res);
    if (user) {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      if (!q) { json(res, 200, { data: { leads: [], customers: [], agents: [], followUps: [] }, total: 0 }); return; }
      const matches = (value) => String(value || '').toLowerCase().includes(q);
      const scopedLeads = leads.filter(item => canViewLead(user, item)).filter(item => [item.full_name, item.phone, item.email, item.interested_in, item.lead_source].some(matches)).slice(0, 8).map(leadView);
      const scopedCustomers = customers.filter(item => canViewCustomer(user, item)).filter(item => [item.full_name, item.phone, item.email, item.interested_in, item.city].some(matches)).slice(0, 8).map(customerView);
      const scopedFollowUps = followUps.filter(item => canViewFollowUp(user, item)).filter(item => [item.customer_name, item.customer_phone, item.assigned_agent, item.follow_up_type, item.notes].some(matches)).slice(0, 8).map(followUpView);
      const scopedAgents = ['super_admin', 'sales_manager'].includes(user.role) ? reportUsersFor(user).filter(item => [item.full_name, item.email, item.phone, item.role].some(matches)).slice(0, 8).map(item => agentView(user, item)) : [];
      const data = { leads: scopedLeads, customers: scopedCustomers, agents: scopedAgents, followUps: scopedFollowUps };
      addActivityLog(user.id, 'search', q, 'Global search', `Global search performed for “${q}”.`);
      json(res, 200, { data, total: Object.values(data).reduce((sum, items) => sum + items.length, 0) });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/notifications') {
    const user = requireAuth(req, res);
    if (user) { const items = (notifications.get(user.id) || []).sort((a, b) => b.created_at.localeCompare(a.created_at)); json(res, 200, { data: items.map(notificationView), unread: items.filter(item => !item.is_read).length }); }
    return;
  }
  const notificationMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notificationMatch && req.method === 'PATCH') {
    const user = requireAuth(req, res); const item = (notifications.get(user?.id) || []).find(entry => entry.id === notificationMatch[1]);
    if (!item) { json(res, 404, { error: 'Notification not found' }); return; }
    item.is_read = true; item.read_at = new Date().toISOString(); json(res, 200, { data: notificationView(item) }); return;
  }
  if (req.method === 'PATCH' && url.pathname === '/api/notifications/read-all') {
    const user = requireAuth(req, res); if (user) { (notifications.get(user.id) || []).forEach(item => { item.is_read = true; item.read_at = new Date().toISOString(); }); json(res, 200, { ok: true }); } return;
  }

  if (req.method === 'GET' && url.pathname === '/api/activity-logs') {
    const user = requireAuth(req, res);
    if (user) {
      const visible = activityLogs.filter(item => user.role === 'super_admin' || item.actor_user_id === user.id || (user.role === 'sales_manager' && users.find(actor => actor.id === item.actor_user_id)?.team_id === user.team_id)).slice(0, 100);
      json(res, 200, { data: visible });
    }
    return;
  }

  if (url.pathname === '/api/settings' || url.pathname.startsWith('/api/settings/')) {
    const user = requireRole(req, res, ['super_admin']);
    if (!user) return;
    if (req.method === 'GET' && url.pathname === '/api/settings') { json(res, 200, { requestedBy: user.role, data: settingsView() }); return; }
    if (req.method === 'PATCH' && url.pathname === '/api/settings/company') {
      const body = await readBody(req); if (body.company_name !== undefined && !String(body.company_name).trim()) { json(res, 422, { error: 'Company name is required' }); return; }
      ['company_name', 'crm_name', 'logo_url', 'email', 'phone', 'address', 'timezone', 'currency'].forEach(field => { if (body[field] !== undefined) systemSettings.company[field] = String(body[field]).trim(); });
      addActivityLog(user.id, 'settings', 'company', 'Settings updated', 'Company settings were updated.'); json(res, 200, { data: settingsView().company }); return;
    }
    if (req.method === 'PATCH' && url.pathname === '/api/settings/preferences') {
      const body = await readBody(req); if (body.default_table_page_size !== undefined && ![10, 25, 50, 100].includes(Number(body.default_table_page_size))) { json(res, 422, { error: 'Table page size must be 10, 25, 50, or 100' }); return; }
      ['default_lead_status', 'default_lead_source', 'default_dashboard_range', 'default_timezone', 'default_currency', 'default_table_page_size', 'default_follow_up_reminder_minutes'].forEach(field => { if (body[field] !== undefined) systemSettings.preferences[field] = ['default_table_page_size', 'default_follow_up_reminder_minutes'].includes(field) ? Number(body[field]) : String(body[field]); });
      addActivityLog(user.id, 'settings', 'preferences', 'Settings updated', 'CRM preferences were updated.'); json(res, 200, { data: settingsView().preferences }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/security') { json(res, 200, { data: systemSettings.security }); return; }
    if (req.method === 'PATCH' && url.pathname === '/api/settings/security') {
      const body = await readBody(req); const numeric = ['temporary_password_expiry_hours', 'minimum_password_length']; const flags = ['force_password_change_first_login', 'require_uppercase', 'require_lowercase', 'require_number', 'require_special_character', 'block_inactive_suspended_login'];
      numeric.forEach(field => { if (body[field] !== undefined) systemSettings.security[field] = Math.max(field === 'minimum_password_length' ? 8 : 1, Number(body[field])); }); flags.forEach(field => { if (body[field] !== undefined) systemSettings.security[field] = Boolean(body[field]); });
      addActivityLog(user.id, 'settings', 'security', 'Security policy updated', 'Global authentication and password policy was updated.'); json(res, 200, { data: systemSettings.security }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/email-access') { json(res, 200, { data: systemSettings.email_access }); return; }
    if (req.method === 'PATCH' && url.pathname === '/api/settings/email-access') {
      const body = await readBody(req); ['sender_name', 'sender_email', 'access_email_subject', 'access_email_template', 'password_reset_subject', 'password_reset_template'].forEach(field => { if (body[field] !== undefined) systemSettings.email_access[field] = String(body[field]).trim(); }); if (body.email_enabled !== undefined) systemSettings.email_access.email_enabled = Boolean(body.email_enabled);
      addActivityLog(user.id, 'settings', 'email-access', 'Email settings updated', 'Access email and password reset templates were updated.'); json(res, 200, { data: systemSettings.email_access }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/permissions') {
      const roleKey = { super_admin: 'SUPER_ADMIN', sales_manager: 'SALES_MANAGER', sales_agent: 'SALES_AGENT' };
      const data = permissionCatalog.map(([key, label]) => ({ key, label, super_admin: key === 'settings.manage' || key.startsWith('settings') ? true : true, sales_manager: ['dashboard.view', 'leads.view_all', 'leads.view_own', 'leads.create', 'leads.assign', 'customers.view', 'followups.manage', 'chat.use', 'reports.view', 'agents.manage'].includes(key), sales_agent: ['dashboard.view', 'leads.view_own', 'customers.view', 'followups.manage', 'chat.use'].includes(key) }));
      json(res, 200, { roles: roleKey, data }); return;
    }
    if (req.method === 'PATCH' && url.pathname === '/api/settings/permissions') { addActivityLog(user.id, 'settings', 'permissions', 'Permission settings reviewed', 'Fixed Phase 1 role permissions were reviewed.'); json(res, 200, { data: { message: 'Phase 1 role permissions are fixed by policy.' } }); return; }
    if (req.method === 'GET' && url.pathname === '/api/settings/notifications') { json(res, 200, { data: notificationSettings.get(user.id) || notificationDefinitions }); return; }
    if (req.method === 'PATCH' && url.pathname === '/api/settings/notifications') {
      const body = await readBody(req); const entries = notificationSettings.get(user.id) || notificationDefinitions.map(item => ({ ...item })); const updates = Array.isArray(body.notifications) ? body.notifications : [body];
      updates.forEach(update => { const item = entries.find(entry => entry.event_key === update.event_key); if (!item) return; ['in_app_enabled', 'email_enabled', 'whatsapp_enabled', 'sms_enabled'].forEach(field => { if (update[field] !== undefined) item[field] = Boolean(update[field]); }); }); notificationSettings.set(user.id, entries); addActivityLog(user.id, 'settings', 'notifications', 'Notification preferences updated', 'Notification channel preferences were updated.'); json(res, 200, { data: entries }); return;
    }
    const collectionMatch = url.pathname.match(/^\/api\/settings\/(lead-statuses|lead-tags|lead-sources)$/);
    if (collectionMatch && req.method === 'GET') { const collection = collectionMatch[1] === 'lead-statuses' ? leadStatuses : collectionMatch[1] === 'lead-tags' ? leadTags : leadSources; json(res, 200, { data: collection }); return; }
    if (collectionMatch && req.method === 'POST') {
      const body = await readBody(req); if (!String(body.name || '').trim()) { json(res, 422, { error: 'Name is required' }); return; }
      const collection = collectionMatch[1] === 'lead-statuses' ? leadStatuses : collectionMatch[1] === 'lead-tags' ? leadTags : leadSources; const name = String(body.name).trim(); if (collection.some(item => item.name.toLowerCase() === name.toLowerCase())) { json(res, 409, { error: 'That name already exists' }); return; }
      const prefix = collectionMatch[1] === 'lead-statuses' ? 'status' : collectionMatch[1] === 'lead-tags' ? 'tag' : 'source'; const created = { id: `${prefix}_${crypto.randomUUID().slice(0, 8)}`, name, slug: settingSlug(name), color: body.color || '#8d7658', is_active: true, is_default: false, sort_order: collection.length + 1, tag_type: collectionMatch[1] === 'lead-tags' ? 'lead' : undefined, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; collection.push(created); addActivityLog(user.id, 'settings', prefix, 'Configuration added', `${name} was added to ${collectionMatch[1]}.`); json(res, 201, { data: created }); return;
    }
    const entityMatch = url.pathname.match(/^\/api\/settings\/(lead-statuses|lead-tags|lead-sources)\/([^/]+)(?:\/(status))?$/);
    if (entityMatch) {
      const type = entityMatch[1]; const collection = type === 'lead-statuses' ? leadStatuses : type === 'lead-tags' ? leadTags : leadSources; const item = collection.find(entry => entry.id === entityMatch[2]); if (!item) { json(res, 404, { error: 'Setting item not found' }); return; }
      if (req.method !== 'PATCH') { json(res, 405, { error: 'Method not allowed' }); return; }
      const body = await readBody(req);
      if (entityMatch[3] === 'status') item.is_active = body.is_active !== undefined ? Boolean(body.is_active) : item.is_active;
      else { if (body.name !== undefined && !String(body.name).trim()) { json(res, 422, { error: 'Name is required' }); return; } const previousName = item.name; if (body.name !== undefined) { item.name = String(body.name).trim(); item.slug = settingSlug(item.name); if (type === 'lead-statuses') leads.forEach(lead => { if (lead.status === previousName) lead.status = item.name; }); if (type === 'lead-sources') leads.forEach(lead => { if (lead.lead_source === previousName) lead.lead_source = item.name; }); } if (body.color !== undefined) item.color = body.color; if (body.sort_order !== undefined) item.sort_order = Number(body.sort_order); }
      item.updated_at = new Date().toISOString(); addActivityLog(user.id, 'settings', item.id, 'Configuration updated', `${item.name} configuration was updated.`); json(res, 200, { data: item }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/activities') { json(res, 200, { data: activityLogs.filter(item => item.entity_type === 'settings').slice(0, 100) }); return; }
    json(res, 404, { error: 'Settings route not found' }); return;
  }

  refreshFollowUpStatuses();

  if (req.method === 'GET' && (url.pathname === '/api/follow-ups' || url.pathname === '/api/follow-ups/my')) {
    const user = url.pathname.endsWith('/my') ? requireAuth(req, res) : requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) {
      let data = followUps.filter(item => url.pathname.endsWith('/my') ? item.assigned_agent_id === user.id : canViewFollowUp(user, item));
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const priority = url.searchParams.get('priority');
      const date = url.searchParams.get('date');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      if (status) data = data.filter(item => item.status === status);
      if (type) data = data.filter(item => item.follow_up_type === type);
      if (priority) data = data.filter(item => item.priority === priority);
      if (q) data = data.filter(item => [item.customer_name, item.customer_phone, item.assigned_agent, item.notes].some(value => String(value || '').toLowerCase().includes(q)));
      if (date === 'overdue') data = data.filter(item => item.status === 'Overdue');
      if (date && date !== 'overdue') {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const target = new Date(today);
        if (date === 'tomorrow') target.setDate(target.getDate() + 1);
        if (date === 'week') { const end = new Date(today); end.setDate(end.getDate() + 7); data = data.filter(item => { const d = new Date(`${item.due_date}T00:00:00`); return d >= today && d < end; }); }
        else if (date === 'month') data = data.filter(item => { const d = new Date(`${item.due_date}T00:00:00`); return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth(); });
        else data = data.filter(item => item.due_date === target.toISOString().slice(0, 10));
      }
      data.sort((a, b) => `${a.due_date}T${a.due_time}`.localeCompare(`${b.due_date}T${b.due_time}`));
      json(res, 200, { scope: url.pathname.endsWith('/my') ? 'assigned' : user.role === 'super_admin' ? 'company' : 'team', data: data.map(followUpView) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/follow-ups') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await readBody(req);
    const customer = customers.find(item => item.id === body.customer_id);
    if (!customer) { json(res, 400, { error: 'A valid customer is required' }); return; }
    if (!canViewCustomer(user, customer)) { json(res, 403, { error: 'Access denied — customer is outside your ownership scope' }); return; }
    let assigned = users.find(item => item.id === body.assigned_agent_id && item.status === 'active' && ['sales_agent', 'sales_manager'].includes(item.role));
    if (user.role === 'sales_agent') assigned = users.find(item => item.id === user.id);
    if (!assigned) assigned = users.find(item => item.id === customer.assigned_agent_id);
    if (!assigned || (user.role === 'sales_manager' && assigned.team_id !== user.team_id)) { json(res, 400, { error: 'Choose an active advisor from your permitted team' }); return; }
    if (!body.due_date || !body.due_time) { json(res, 400, { error: 'Due date and time are required' }); return; }
    const item = { id: `followup_${String(followUps.length + 1).padStart(3, '0')}`, customer_id: customer.id, lead_id: body.lead_id || customer.lead_id || null, created_by: user.id, follow_up_type: body.follow_up_type || body.type || 'General Follow-up', due_date: body.due_date, due_time: body.due_time, priority: body.priority || 'Medium', status: 'Pending', notes: body.notes || body.note || '', customer_name: customer.full_name, customer_phone: customer.phone, assigned_agent_id: assigned.id, assigned_agent: assigned.full_name, assigned_team_id: assigned.team_id, lead_status: customer.customer_status, last_activity: customer.last_contacted_at || 'Not contacted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    followUps.unshift(item); followUpActivities.set(item.id, []); addFollowUpActivity(item, user.id, 'Follow-up scheduled', `${item.follow_up_type} scheduled for ${item.due_date} at ${item.due_time}`); customer.next_follow_up_at = `${item.due_date} · ${item.due_time}`;
    json(res, 201, { data: followUpView(item) }); return;
  }

  const followUpMatch = url.pathname.match(/^\/api\/follow-ups\/([^/]+)$/);
  const followUpActionMatch = url.pathname.match(/^\/api\/follow-ups\/([^/]+)\/(reschedule|complete|missed|cancel|notes|activity)$/);
  if (followUpMatch && req.method === 'GET') {
    const user = requireAuth(req, res); const item = findFollowUp(followUpMatch[1]);
    if (!item) { json(res, 404, { error: 'Follow-up not found' }); return; }
    if (!canViewFollowUp(user, item)) { json(res, 403, { error: 'Access denied — follow-up is outside your ownership scope' }); return; }
    json(res, 200, { data: followUpView(item), activity: followUpActivities.get(item.id) || [] }); return;
  }
  if (followUpMatch && req.method === 'PATCH') {
    const user = requireAuth(req, res); const item = findFollowUp(followUpMatch[1]);
    if (!item) { json(res, 404, { error: 'Follow-up not found' }); return; }
    if (!canViewFollowUp(user, item)) { json(res, 403, { error: 'Access denied — follow-up is outside your ownership scope' }); return; }
    const body = await readBody(req); ['follow_up_type', 'due_date', 'due_time', 'priority', 'notes'].forEach(field => { if (body[field] !== undefined) item[field] = body[field]; });
    item.updated_at = new Date().toISOString(); addFollowUpActivity(item, user.id, 'Follow-up updated', 'Follow-up details updated'); json(res, 200, { data: followUpView(item) }); return;
  }
  if (followUpActionMatch) {
    const user = requireAuth(req, res); const item = findFollowUp(followUpActionMatch[1]); const action = followUpActionMatch[2];
    if (!item) { json(res, 404, { error: 'Follow-up not found' }); return; }
    if (!canViewFollowUp(user, item)) { json(res, 403, { error: 'Access denied — follow-up is outside your ownership scope' }); return; }
    if (action === 'activity' && req.method === 'GET') { json(res, 200, { data: followUpActivities.get(item.id) || [] }); return; }
    const body = await readBody(req);
    if (action === 'reschedule' && req.method === 'PATCH') { if (!body.due_date || !body.due_time) { json(res, 400, { error: 'New date and time are required' }); return; } const previous = { fromDate: item.due_date, fromTime: item.due_time, toDate: body.due_date, toTime: body.due_time, reason: body.reason || '' }; item.rescheduled_from_date = item.due_date; item.rescheduled_from_time = item.due_time; item.reschedule_reason = body.reason || ''; item.reschedule_history = [...(item.reschedule_history || []), previous]; item.due_date = body.due_date; item.due_time = body.due_time; item.status = 'Rescheduled'; item.updated_at = new Date().toISOString(); addFollowUpActivity(item, user.id, 'Follow-up rescheduled', body.reason || `Moved to ${item.due_date} at ${item.due_time}`); json(res, 200, { data: followUpView(item) }); return; }
    if (action === 'complete' && req.method === 'PATCH') { item.status = 'Completed'; item.completed_at = new Date().toISOString(); item.completed_by = user.id; item.completion_note = body.completion_note || body.note || ''; item.customer_response = body.customer_response || ''; item.updated_at = new Date().toISOString(); addFollowUpActivity(item, user.id, 'Follow-up completed', item.completion_note || 'Follow-up marked as completed'); if (body.next_due_date && body.next_due_time) { item.next_follow_up = { due_date: body.next_due_date, due_time: body.next_due_time }; } json(res, 200, { data: followUpView(item) }); return; }
    if (action === 'missed' && req.method === 'PATCH') { item.status = 'Missed'; item.updated_at = new Date().toISOString(); addFollowUpActivity(item, user.id, 'Follow-up missed', body.reason || 'Follow-up marked as missed'); json(res, 200, { data: followUpView(item) }); return; }
    if (action === 'cancel' && req.method === 'PATCH') { item.status = 'Cancelled'; item.cancelled_at = new Date().toISOString(); item.cancelled_by = user.id; item.cancel_reason = body.reason || ''; item.updated_at = new Date().toISOString(); addFollowUpActivity(item, user.id, 'Follow-up cancelled', body.reason || 'Follow-up cancelled'); json(res, 200, { data: followUpView(item) }); return; }
    if (action === 'notes' && req.method === 'POST') { if (!body.note) { json(res, 400, { error: 'Note is required' }); return; } addFollowUpActivity(item, user.id, 'Note added', body.note); item.notes = body.note; item.last_activity = body.note; item.updated_at = new Date().toISOString(); json(res, 201, { data: followUpView(item) }); return; }
    json(res, 405, { error: 'Method not allowed' }); return;
  }

  if (req.method === 'GET' && url.pathname === '/api/reports') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) json(res, 200, { requestedBy: user.role, data: reportResponseFor(user, url.searchParams) });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/reports/leads') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) json(res, 200, { data: reportResponseFor(user, url.searchParams).leadReport });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/reports/customers') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) json(res, 200, { data: reportResponseFor(user, url.searchParams).customerReport });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/reports/follow-ups') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) json(res, 200, { data: reportResponseFor(user, url.searchParams).followUpReport });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/reports/conversion-overview') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) json(res, 200, { data: reportResponseFor(user, url.searchParams).charts.conversionOverview });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/reports/export') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']); if (user) json(res, 202, { data: { success: true, message: 'Report export will be available in a future update.', fileName: 'aureum-report-placeholder' } });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const user = requireRole(req, res, ['super_admin']);
    if (user) json(res, 200, { requestedBy: user.role, data: {} });
    return;
  }

  const dashboardRoutes = {
    '/api/dashboard/summary': 'summary',
    '/api/dashboard/lead-inflow': 'leadInflow',
    '/api/dashboard/lead-sources': 'leadSources',
    '/api/dashboard/follow-up-performance': 'followUpPerformance',
    '/api/dashboard/conversion-overview': 'conversionOverview',
    '/api/dashboard/recent-leads': 'recentLeads',
    '/api/dashboard/today-follow-ups': 'todayFollowUps'
  };
  if (req.method === 'GET' && dashboardRoutes[url.pathname]) {
    const user = requireAuth(req, res);
    if (user) { const dashboard = dashboardForUser(user); json(res, 200, { scope: dashboard.scopeLabel, data: dashboardRoutes[url.pathname] === 'summary' ? dashboard.summary : dashboard[dashboardRoutes[url.pathname]] }); }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard/agent-performance') {
    const user = requireRole(req, res, ['super_admin', 'sales_manager']);
    if (user) json(res, 200, { scope: dashboardForUser(user).scopeLabel, data: dashboardForUser(user).agentPerformance });
    return;
  }

  json(res, 404, { error: 'API route not found' });
}

function requestHandler(req, res) {
  return handle(req, res).catch(error => {
  console.error(error);
  if (res.headersSent) { res.end(); return; }
  json(res, 500, { error: 'Something went wrong. Please try again.' });
  });
}

module.exports = { handle, requestHandler };

if (require.main === module) {
  http.createServer(requestHandler).listen(PORT, () => {
    console.log(`Aureum CRM local server running at http://127.0.0.1:${PORT}`);
  });
}
