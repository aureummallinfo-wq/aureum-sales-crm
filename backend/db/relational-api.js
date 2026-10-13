const crypto = require('node:crypto');

function createRelationalApi({ repository, workspaceId, json, readBody, readBodyLimited, safeText, validateEmail, validatePhone, validateIsoDate, passwordHash, passwordPolicySatisfied, leadView, customerView, followUpView, publicUser, userManagementView, notificationView, rolePermissions, crmTimezone }) {
  function deny(res, message = 'Access denied — insufficient permission') { json(res, 403, { error: message }); return true; }
  function unauthenticated(res) { json(res, 401, { error: 'Authentication required' }); return true; }
  function role(user, roles, res) { if (!user) { unauthenticated(res); return false; } if (roles.includes(user.role)) return true; deny(res); return false; }
  const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const PRESENCE_AWAY_WINDOW_MS = 15 * 60 * 1000;
  function presenceStatus(user, now = Date.now()) {
    if (!user || user.status !== 'active') return 'Offline';
    const lastActivity = Date.parse(user.last_activity_at || user.last_login_at || '');
    if (!Number.isFinite(lastActivity)) return 'Offline';
    const age = Math.max(0, now - lastActivity);
    if (age <= PRESENCE_ONLINE_WINDOW_MS) return 'Online';
    if (age <= PRESENCE_AWAY_WINDOW_MS) return 'Away';
    return 'Offline';
  }
  function canView(user, item) {
    if (!user || !item) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'sales_manager') return item.assigned_team_id === user.team_id;
    return item.assigned_agent_id === user.id;
  }
  function canViewLead(user, lead) { return user?.role === 'sales_manager' || canView(user, lead); }

  function webhookView(item) {
    if (!item) return null;
    const status = String(item.status || 'inactive').toLowerCase();
    return { id: item.legacy_id || item.id, connectionName: item.connection_name, sourceType: item.source_type || item.source_platform, sourcePlatform: item.source_platform, webhookUrl: `/api/webhooks/leads/${item.legacy_id || item.id}`, secretTokenMasked: '••••••••', status: status === 'active' ? 'Active' : 'Inactive', defaultLeadSource: item.default_lead_source || (item.source_platform === 'meta' ? 'Meta Lead Ads' : 'Webhook'), defaultLeadStatus: item.default_lead_status || 'New', defaultTags: item.default_tags || ['Imported Lead', 'Webhook Lead'], defaultAssignedTeam: item.default_assigned_team_id || null, defaultAssignedAgent: item.default_assigned_agent_id || null, autoAssignLead: Boolean(item.auto_assign_lead), duplicateCheckRule: item.duplicate_check_rule || 'externalLeadId', fieldMappings: item.field_mappings || {}, createdBy: item.created_by, createdAt: item.created_at, updatedAt: item.updated_at, lastReceivedAt: item.last_received_at || null, failedAttempts: item.failed_attempts || 0, unauthorizedAttempts: item.unauthorized_attempts || 0, healthStatus: status === 'active' ? (item.last_received_at ? 'Healthy' : 'No Recent Data') : 'Disabled' };
  }

  function taskView(item) {
    if (!item) return null;
    return {
      id: item.id,
      title: item.title,
      description: item.description || '',
      status: item.status,
      priority: item.priority,
      dueAt: item.due_at || null,
      completedAt: item.completed_at || null,
      assignedTo: item.assigned_to || null,
      assignedAgentId: item.assigned_agent_id || null,
      assignedAgent: item.assigned_agent || 'Unassigned',
      assignedAgentEmail: item.assigned_agent_email || null,
      assignedTeamId: item.assigned_team_id || null,
      createdBy: item.created_by || null,
      createdByName: item.created_by_name || null,
      leadId: item.lead_id || null,
      leadName: item.lead_name || null,
      customerId: item.customer_id || null,
      customerName: item.customer_name || null,
      followUpId: item.follow_up_id || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    };
  }

  function searchView(result) { return { leads: result.leads.map(leadView), customers: result.customers.map(customerView), followUps: result.followUps.map(followUpView) }; }

  function localDate(value = new Date()) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: crmTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)); const map = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${map.year}-${map.month}-${map.day}`; }
  function dateBounds(params = {}) { const today = localDate(); const range = params.dateRange || 'this_month'; let start = today; let end = today; const asDate = value => new Date(`${value}T00:00:00Z`); const iso = value => value.toISOString().slice(0, 10); if (range === 'yesterday') { const date = asDate(today); date.setUTCDate(date.getUTCDate() - 1); start = end = iso(date); } else if (range === 'this_week') { const date = asDate(today); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); start = iso(date); date.setUTCDate(date.getUTCDate() + 6); end = iso(date); } else if (range === 'last_month') { const first = asDate(`${today.slice(0, 7)}-01`); first.setUTCMonth(first.getUTCMonth() - 1); start = iso(first); const last = asDate(`${today.slice(0, 7)}-01`); last.setUTCDate(0); end = iso(last); } else if (range === 'custom') { start = /^\d{4}-\d{2}-\d{2}$/.test(params.startDate || '') ? params.startDate : today; end = /^\d{4}-\d{2}-\d{2}$/.test(params.endDate || '') ? params.endDate : start; if (end < start) [start, end] = [end, start]; } else if (range === 'today') { start = end = today; } else { start = `${today.slice(0, 7)}-01`; const next = asDate(start); next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(0); end = iso(next); } return { start, end, range }; }
  function recordDate(value) { if (!value) return ''; const text = String(value); if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10); return localDate(value); }
  function inDateRange(value, bounds) { const date = recordDate(value); return Boolean(date && date >= bounds.start && date <= bounds.end); }
  function isoDate(value) { return value.toISOString().slice(0, 10); }
  function addIsoDays(value, amount) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return isoDate(date); }
  function dateSpanDays(start, end) { return Math.floor((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1; }
  function hasTimeComponent(value) { return /(?:T|\s)\d{2}:\d{2}/.test(String(value || '')); }
  function localHourBucket(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: crmTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:00`;
  }
  function isoWeekStart(value) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return isoDate(date); }
  function leadInflowGranularity(bounds, leads) {
    if (bounds.range === 'today' && leads.some(item => hasTimeComponent(item.created_at || item.updated_at))) return 'hour';
    const span = dateSpanDays(bounds.start, bounds.end);
    if (span <= 31) return 'day';
    if (span <= 366) return 'week';
    return 'month';
  }
  function leadInflowKey(value, granularity) {
    const date = recordDate(value);
    if (!date) return '';
    if (granularity === 'hour' && hasTimeComponent(value)) return localHourBucket(value) || date;
    if (granularity === 'week') return isoWeekStart(date);
    if (granularity === 'month') return date.slice(0, 7);
    return date;
  }
  function leadInflowBuckets(bounds, granularity) {
    if (granularity === 'hour') return Array.from({ length: 24 }, (_, hour) => `${bounds.start}T${String(hour).padStart(2, '0')}:00`);
    if (granularity === 'day') return Array.from({ length: dateSpanDays(bounds.start, bounds.end) }, (_, index) => addIsoDays(bounds.start, index));
    const buckets = new Set();
    for (let index = 0; index < dateSpanDays(bounds.start, bounds.end); index += 1) buckets.add(leadInflowKey(addIsoDays(bounds.start, index), granularity));
    return [...buckets];
  }
  function leadInflowData(leads, bounds) {
    const granularity = leadInflowGranularity(bounds, leads);
    const counts = new Map();
    for (const lead of leads) { const value = lead.created_at || lead.updated_at; const key = leadInflowKey(value, granularity); if (key) counts.set(key, (counts.get(key) || 0) + 1); }
    return leadInflowBuckets(bounds, granularity).map(label => ({ label, leads: counts.get(label) || 0 }));
  }
  function reportRows(users, leads, customers, followUps) { return users.filter(item => ['sales_agent', 'sales_manager'].includes(item.role)).map(agent => { const assignedLeads = leads.filter(item => item.assigned_agent_id === agent.id); const assignedCustomers = customers.filter(item => item.assigned_agent_id === agent.id); const assignedFollowUps = followUps.filter(item => item.assigned_agent_id === agent.id); const closedDeals = assignedLeads.filter(item => item.status === 'Closed Won').length; const overdue = assignedFollowUps.filter(item => item.status === 'Overdue').length; const conversion = assignedLeads.length ? Number((closedDeals / assignedLeads.length * 100).toFixed(1)) : 0; return { agentId: agent.id, agentName: agent.full_name, agentRole: agent.role === 'sales_manager' ? 'Sales Manager' : 'Sales Agent', teamId: agent.team_id, teamName: agent.team_name || agent.team_id || 'Unassigned', status: agent.status === 'active' ? 'Active' : 'Inactive', presenceStatus: presenceStatus(agent), assignedLeads: assignedLeads.length, contactedLeads: assignedLeads.filter(item => item.status !== 'New').length, hotLeads: assignedLeads.filter(item => ['Hot', 'Booking'].includes(item.status)).length, followUpsAssigned: assignedFollowUps.length, followUpsCompleted: assignedFollowUps.filter(item => item.status === 'Completed').length, overdueFollowUps: overdue, closedDeals, lostLeads: assignedLeads.filter(item => ['Closed Lost', 'Lost'].includes(item.status)).length, totalCustomers: assignedCustomers.length, conversionRate: conversion, lastActivityAt: agent.last_activity_at || agent.last_login_at || agent.updated_at }; }); }

  async function reportData(user, params = {}) {
    const bounds = dateBounds(params); const leadStatus = params.leadStatus && params.leadStatus !== 'all' ? params.leadStatus : ''; const leadSource = params.leadSource && params.leadSource !== 'all' ? params.leadSource : ''; const followUpStatus = params.followUpStatus && params.followUpStatus !== 'all' ? params.followUpStatus : ''; const requestedAgent = params.agentId && params.agentId !== 'all' ? params.agentId : ''; const requestedTeam = params.teamId && params.teamId !== 'all' ? params.teamId : '';
    const [users, rawLeads, rawCustomers, rawFollowUps] = await Promise.all([repository.listUsers(workspaceId, user), repository.listLeads({ workspaceId, user, status: leadStatus, source: leadSource, agentId: requestedAgent }), repository.listCustomers({ workspaceId, user }), repository.listFollowUps({ workspaceId, user })]);
    const scopedUsers = users.filter(item => ['sales_agent', 'sales_manager'].includes(item.role) && (!requestedAgent || item.id === requestedAgent) && (!requestedTeam || item.team_id === requestedTeam)); const visibleAgentIds = new Set(scopedUsers.map(item => item.id));
    const leads = rawLeads.filter(item => visibleAgentIds.has(item.assigned_agent_id) && inDateRange(item.created_at || item.updated_at, bounds)); const customers = rawCustomers.filter(item => visibleAgentIds.has(item.assigned_agent_id) && inDateRange(item.created_at || item.updated_at, bounds)); const followUps = rawFollowUps.filter(item => visibleAgentIds.has(item.assigned_agent_id) && inDateRange(item.due_date, bounds) && (!followUpStatus || item.status === followUpStatus));
    const closedWon = leads.filter(item => item.status === 'Closed Won').length; const completed = followUps.filter(item => item.status === 'Completed').length; const conversionRate = leads.length ? Number((closedWon / leads.length * 100).toFixed(1)) : 0;
    const agentReports = reportRows(scopedUsers, leads, customers, followUps);
    const leadSourcePerformance = [...new Set(leads.map(item => item.lead_source).filter(Boolean))].map(label => ({ label, value: leads.filter(item => item.lead_source === label).length }));
    const leadInflow = leadInflowData(leads, bounds);
    const newLeads = leads.filter(item => item.status === 'New').length;
    const followUpsDue = followUps.filter(item => ['Pending', 'Rescheduled'].includes(item.status)).length;
    const overdueFollowUps = followUps.filter(item => item.status === 'Overdue').length;
    const activeCustomers = customers.filter(item => !['Closed Won', 'Closed Lost', 'Not Interested'].includes(item.customer_status)).length;
    const summary = { totalAgents: scopedUsers.length, totalLeads: leads.length, assignedLeads: leads.length, newLeads, contactedLeads: leads.filter(item => item.status !== 'New').length, hotLeads: leads.filter(item => item.status === 'Hot').length, followUpsDue, followUpsCompleted: completed, overdueFollowUps, activeCustomers, closedDeals: closedWon, lostLeads: leads.filter(item => item.status === 'Closed Lost').length, conversionRate, myLeads: leads.length, myHotLeads: leads.filter(item => item.status === 'Hot').length, myFollowUpsToday: followUps.filter(item => item.due_date === localDate()).length, myOverdueFollowUps: overdueFollowUps, myCustomers: customers.length, myClosedDeals: closedWon };
    return { role: user.role, scope: user.role === 'super_admin' ? 'company' : user.role === 'sales_manager' ? 'team' : 'assigned', dateRange: bounds.range, summary, leadInflow, agentReports, leadReport: { totalLeads: leads.length, newLeads, contactedLeads: leads.filter(item => item.status !== 'New').length, hotLeads: leads.filter(item => item.status === 'Hot').length, warmLeads: leads.filter(item => item.status === 'Warm').length, coldLeads: leads.filter(item => item.status === 'Cold').length, closedWon, closedLost: leads.filter(item => item.status === 'Closed Lost').length, conversionRate }, customerReport: { totalCustomers: customers.length, activeCustomers, hotCustomers: customers.filter(item => item.customer_status === 'Hot').length, bookingInterestedCustomers: customers.filter(item => item.customer_status === 'Booking Interested').length, closedCustomers: customers.filter(item => item.customer_status === 'Closed Won').length, lostCustomers: customers.filter(item => item.customer_status === 'Closed Lost').length }, followUpReport: { totalFollowUps: followUps.length, todaysFollowUps: followUps.filter(item => item.due_date === localDate()).length, completedFollowUps: completed, overdueFollowUps, missedFollowUps: followUps.filter(item => item.status === 'Missed').length, rescheduledFollowUps: followUps.filter(item => item.status === 'Rescheduled').length, completionRate: followUps.length ? Number((completed / followUps.length * 100).toFixed(1)) : 0 }, charts: { conversionOverview: ['New', 'Contacted', 'Qualified', 'Follow-up', 'Negotiation', 'Booking', 'Closed Won'].map(stage => ({ stage, count: leads.filter(item => item.status === stage).length, percentage: leads.length ? Number((leads.filter(item => item.status === stage).length / leads.length * 100).toFixed(1)) : 0 })), leadSourcePerformance, followUpStatusPerformance: ['Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled', 'Cancelled'].map(label => ({ label, value: followUps.filter(item => item.status === label).length })), agentConversionPerformance: agentReports.map(row => ({ label: row.agentName, value: row.conversionRate })) }, meta: { generatedAt: new Date().toISOString(), timezone: crmTimezone, currency: 'PKR' }, filters: { dateRange: bounds.range, teamId: requestedTeam || 'all', agentId: requestedAgent || 'all', leadStatus: leadStatus || 'all', leadSource: leadSource || 'all', followUpStatus: followUpStatus || 'all', startDate: bounds.start, endDate: bounds.end, teams: [...new Set(scopedUsers.map(item => item.team_id).filter(Boolean))], agents: scopedUsers.map(item => ({ id: item.id, name: item.full_name, teamId: item.team_id })) } };
  }

  async function reportAgentDetail(user, identifier, params = {}) {
    const target = await repository.findUser(workspaceId, identifier); if (!target) return null; if (user.role === 'sales_manager' && target.team_id !== user.team_id) return null;
    const [report, leads, customers, followUps, activity] = await Promise.all([reportData(user, { ...params, agentId: target.id }), repository.listLeads({ workspaceId, user: { ...user, role: 'super_admin' }, agentId: target.id }), repository.listCustomers({ workspaceId, user: { ...user, role: 'super_admin' } }), repository.listFollowUps({ workspaceId, user: { ...user, role: 'super_admin' } }), repository.userActivity(workspaceId, target.id)]);
    const row = report.agentReports.find(item => item.agentId === target.id) || { agentId: target.id, agentName: target.full_name, agentRole: target.role === 'sales_manager' ? 'Sales Manager' : 'Sales Agent', teamName: target.team_name || target.team_id || 'Unassigned', status: target.status === 'active' ? 'Active' : 'Inactive', assignedLeads: 0, contactedLeads: 0, hotLeads: 0, followUpsCompleted: 0, overdueFollowUps: 0, totalCustomers: 0, closedDeals: 0, lostLeads: 0, conversionRate: 0 };
    const agentLeads = leads.filter(item => item.assigned_agent_id === target.id); const agentCustomers = customers.filter(item => item.assigned_agent_id === target.id); const agentFollowUps = followUps.filter(item => item.assigned_agent_id === target.id);
    return { agent: row, overview: { assignedLeads: row.assignedLeads, contactedLeads: row.contactedLeads, hotLeads: row.hotLeads, followUpsCompleted: row.followUpsCompleted, overdueFollowUps: row.overdueFollowUps, customersHandled: row.totalCustomers, closedDeals: row.closedDeals, lostLeads: row.lostLeads, conversionRate: row.conversionRate }, leads: agentLeads.map(item => ({ ...leadView(item), leadId: item.id, leadName: item.full_name, interestedIn: item.interested_in, leadSource: item.lead_source, createdAt: item.created_at, lastContactedAt: item.last_contacted_at, nextFollowUpAt: item.next_follow_up_at })), customers: agentCustomers.map(item => ({ ...customerView(item), customerId: item.id, customerName: item.full_name, interestedIn: item.interested_in, customerStatus: item.customer_status, lastActivityAt: item.updated_at, nextFollowUpAt: item.next_follow_up_at })), followUps: agentFollowUps.map(item => ({ ...followUpView(item), followUpId: item.id, customerName: item.customer_name, followUpType: item.follow_up_type, dueDate: item.due_date, dueTime: item.due_time, completedAt: item.completed_at })), activity: activity.map(item => ({ ...item, activityType: item.activity_type || item.action, createdAt: item.created_at })) };
  }

  async function handle(req, res, url, user) {
    const pathname = url.pathname;

    if (req.method === 'POST' && pathname === '/api/presence/heartbeat') {
      if (!user) return unauthenticated(res);
      const updated = await repository.updateLastActivity(user.id);
      return json(res, 200, { data: { userId: user.id, presenceStatus: 'Online', lastActivityAt: updated?.last_activity_at || new Date().toISOString() } });
    }

    if (req.method === 'GET' && (pathname === '/api/leads' || pathname === '/api/leads/my')) {
      if (!role(user, pathname.endsWith('/my') ? ['super_admin', 'sales_manager', 'sales_agent'] : ['super_admin', 'sales_manager'], res)) return true;
      const data = await repository.listLeads({ workspaceId, user: pathname.endsWith('/my') ? { ...user, role: 'sales_agent' } : user, allSalesManagerLeads: user.role === 'sales_manager' && !pathname.endsWith('/my'), status: url.searchParams.get('status') || '', search: url.searchParams.get('q') || '', source: url.searchParams.get('source') || '', agentId: url.searchParams.get('agentId') || '', imported: url.searchParams.get('imported') || '' });
      return json(res, 200, { scope: pathname.endsWith('/my') ? 'my' : 'all', requestedBy: user.role, data: data.map(leadView) });
    }

    const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
    if (req.method === 'GET' && leadMatch) {
      if (!user) return unauthenticated(res);
      const lead = await repository.getLead(workspaceId, leadMatch[1]);
      if (!lead) return json(res, 404, { error: 'Lead not found' });
      if (!canViewLead(user, lead)) return deny(res, 'Access denied — lead is outside your ownership scope');
      return json(res, 200, { data: leadView(lead) });
    }

    if (req.method === 'DELETE' && leadMatch) {
      if (!role(user, ['super_admin'], res)) return true;
      const lead = await repository.getLead(workspaceId, leadMatch[1]);
      if (!lead) return json(res, 404, { error: 'Lead not found' });
      const deleted = await repository.deleteLead(workspaceId, lead.id, user);
      return deleted ? json(res, 200, { deleted: true, id: deleted.id }) : json(res, 404, { error: 'Lead not found' });
    }

    const leadCustomerMatch = pathname.match(/^\/api\/leads\/([^/]+)\/customer$/);
    if (req.method === 'POST' && leadCustomerMatch) {
      if (!user) return unauthenticated(res);
      const lead = await repository.getLead(workspaceId, leadCustomerMatch[1]);
      if (!lead) return json(res, 404, { error: 'Lead not found' });
      if (!canViewLead(user, lead)) return deny(res, 'Access denied — lead is outside your ownership scope');
      const customer = await repository.convertLeadToCustomer(workspaceId, lead.id, user);
      return json(res, 201, { data: customerView(customer), created: customer?.lead_id === lead.id });
    }

    if (req.method === 'PATCH' && leadMatch) {
      if (!user) return unauthenticated(res);
      const current = await repository.getLead(workspaceId, leadMatch[1]);
      if (!current) return json(res, 404, { error: 'Lead not found' });
      if (!canViewLead(user, current)) return deny(res, 'Access denied — lead is outside your ownership scope');
      const body = await readBody(req);
      if (body.email !== undefined && body.email && !validateEmail(body.email)) return json(res, 422, { error: 'Enter a valid email address.' });
      if (body.phone !== undefined && !validatePhone(body.phone)) return json(res, 422, { error: 'Enter a valid phone number.' });
      const editable = ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'lead_source', 'priority', 'next_follow_up_at', 'status', 'financing_required', 'tags'];
      const patch = Object.fromEntries(editable.filter(field => body[field] !== undefined).map(field => [field, field === 'financing_required' ? Boolean(body[field]) : body[field]]));
      const lead = await repository.updateLead(workspaceId, current.id, user, patch);
      return json(res, 200, { data: leadView(lead) });
    }

    if (req.method === 'POST' && pathname === '/api/leads') {
      if (!role(user, ['super_admin', 'sales_manager', 'sales_agent'], res)) return true;
      const body = await readBody(req); const fullName = safeText(body.full_name, 120); const phone = safeText(body.phone, 32); const email = safeText(body.email, 160).toLowerCase();
      if (!fullName || !phone || !safeText(body.interested_in, 160)) return json(res, 400, { error: 'Full name, phone, and interested in are required' });
      if (!validatePhone(phone) || (email && !validateEmail(email))) return json(res, 422, { error: 'Enter a valid phone number and email address.' });
      const requestedAssignedAgentId = safeText(body.assigned_agent_id, 120);
      const assignedAgentId = user.role === 'sales_agent' ? user.id : requestedAssignedAgentId;
      const assignedAgent = assignedAgentId ? await repository.findUser(workspaceId, assignedAgentId) : null;
      if (assignedAgentId && (!assignedAgent || assignedAgent.status !== 'active' || !['sales_agent', 'sales_manager'].includes(assignedAgent.role) || (user.role === 'sales_manager' && assignedAgent.team_id !== user.team_id) || (user.role === 'sales_agent' && assignedAgent.id !== user.id))) return json(res, 422, { error: 'Choose an active advisor from your permitted team.' });
      const tags = Array.isArray(body.tags) ? [...new Set(body.tags.map(tag => safeText(tag, 40)).filter(Boolean))].slice(0, 10) : [];
      const lead = await repository.createLead({ workspaceId, actor: user, lead: { ...body, full_name: fullName, phone, email, whatsapp_number: safeText(body.whatsapp_number || phone, 32), interested_in: safeText(body.interested_in, 160), lead_source: safeText(body.lead_source || 'Manual Entry', 80), status: safeText(body.status || 'New', 80), priority: ['Low', 'Medium', 'High', 'VIP'].includes(body.priority) ? body.priority : 'Medium', assigned_agent_id: assignedAgent?.id || null, assigned_team_id: assignedAgent?.team_id || (user.role === 'sales_manager' ? user.team_id : null), tags } });
      return json(res, 201, { data: leadView(lead) });
    }

    const leadAction = pathname.match(/^\/api\/leads\/([^/]+)\/(assign|status|notes|tags|activity)$/);
    if (leadAction) {
      if (!user) return unauthenticated(res); const current = await repository.getLead(workspaceId, leadAction[1]); if (!current) return json(res, 404, { error: 'Lead not found' }); if (!canViewLead(user, current)) return deny(res, 'Access denied — lead is outside your ownership scope');
      const action = leadAction[2];
      if (req.method === 'GET' && action === 'activity') return json(res, 200, { data: await repository.listLeadActivities(workspaceId, current.id) });
      if (req.method === 'PATCH' && action === 'assign') { if (!['super_admin', 'sales_manager'].includes(user.role)) return deny(res, 'Only managers can assign leads'); const body = await readBody(req); const lead = await repository.assignLead(workspaceId, current.id, user, body.assigned_agent_id); return lead ? json(res, 200, { data: leadView(lead) }) : json(res, 400, { error: 'A valid active advisor from your permitted scope is required' }); }
      if (req.method === 'PATCH' && action === 'status') { const body = await readBody(req); const lead = await repository.changeLeadStatus(workspaceId, current.id, user, body.status || current.status, body.priority); return lead ? json(res, 200, { data: leadView(lead) }) : json(res, 422, { error: 'Invalid lead status.' }); }
      if (req.method === 'POST' && action === 'notes') { const body = await readBody(req); const note = safeText(body.note, 2000); if (!note) return json(res, 400, { error: 'Note is required' }); const item = await repository.addLeadActivity(workspaceId, current.id, user, 'Note added', note); return json(res, 201, { data: item }); }
      if (req.method === 'POST' && action === 'tags') { const body = await readBody(req); const lead = await repository.updateLead(workspaceId, current.id, user, { tags: body.tag ? [...new Set([...(current.tags || []), safeText(body.tag, 40)])] : current.tags }); return json(res, 201, { data: leadView(lead) }); }
      return json(res, 405, { error: 'Method not allowed' });
    }

    if (req.method === 'GET' && pathname === '/api/tasks') {
      if (!role(user, ['super_admin', 'sales_manager', 'sales_agent'], res)) return true;
      const data = await repository.listTasks(workspaceId, user, { status: url.searchParams.get('status') || '', priority: url.searchParams.get('priority') || '', assignedTo: url.searchParams.get('assignedTo') || '', search: url.searchParams.get('q') || '' });
      return json(res, 200, { scope: user.role === 'super_admin' ? 'company' : user.role === 'sales_manager' ? 'team' : 'assigned', data: data.map(taskView), meta: { total: data.length } });
    }

    if (req.method === 'POST' && pathname === '/api/tasks') {
      if (!role(user, ['super_admin', 'sales_manager'], res)) return true;
      const body = await readBody(req);
      const title = safeText(body.title, 160);
      if (!title) return json(res, 422, { error: 'Task title is required.' });
      if (body.due_at && Number.isNaN(new Date(body.due_at).getTime())) return json(res, 422, { error: 'Enter a valid due date and time.' });
      const task = await repository.createTask(workspaceId, user, { ...body, title, description: safeText(body.description, 5000), assigned_to: safeText(body.assigned_to || body.assigned_agent_id, 120) || user.id });
      return task ? json(res, 201, { data: taskView(task) }) : json(res, 422, { error: 'Choose an active advisor from your permitted scope.' });
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      if (!role(user, ['super_admin', 'sales_manager', 'sales_agent'], res)) return true;
      const task = await repository.getTask(workspaceId, user, taskMatch[1]);
      return task ? json(res, 200, { data: taskView(task) }) : json(res, 404, { error: 'Task not found' });
    }
    if (taskMatch && req.method === 'PATCH') {
      if (!role(user, ['super_admin', 'sales_manager', 'sales_agent'], res)) return true;
      const current = await repository.getTask(workspaceId, user, taskMatch[1]);
      if (!current) return json(res, 404, { error: 'Task not found' });
      const body = await readBody(req);
      const allowed = ['title', 'description', 'status', 'priority', 'due_at', 'assigned_to', 'assigned_agent_id', 'lead_id', 'customer_id', 'follow_up_id'];
      const patch = Object.fromEntries(allowed.filter(field => body[field] !== undefined).map(field => [field, field === 'title' ? safeText(body[field], 160) : field === 'description' ? safeText(body[field], 5000) : body[field]]));
      if (user.role === 'sales_agent') {
        const agentPatch = Object.fromEntries(Object.entries(patch).filter(([field]) => ['status', 'description'].includes(field)));
        Object.keys(patch).forEach(field => { if (!['status', 'description'].includes(field)) delete patch[field]; });
        if (!Object.keys(agentPatch).length) return json(res, 422, { error: 'Agents can update task status or add task context.' });
      }
      if (patch.due_at && Number.isNaN(new Date(patch.due_at).getTime())) return json(res, 422, { error: 'Enter a valid due date and time.' });
      const task = await repository.updateTask(workspaceId, user, taskMatch[1], patch);
      return task ? json(res, 200, { data: taskView(task) }) : json(res, 422, { error: 'Task update is outside your permitted scope.' });
    }
    if (taskMatch && req.method === 'DELETE') {
      if (!role(user, ['super_admin', 'sales_manager'], res)) return true;
      const removed = await repository.deleteTask(workspaceId, user, taskMatch[1]);
      return removed ? json(res, 200, { deleted: true }) : json(res, 404, { error: 'Task not found' });
    }

    if (req.method === 'GET' && (pathname === '/api/customers' || pathname === '/api/customers/my')) {
      if (!role(user, pathname.endsWith('/my') ? ['super_admin', 'sales_manager', 'sales_agent'] : ['super_admin', 'sales_manager'], res)) return true;
      const data = await repository.listCustomers({ workspaceId, user: pathname.endsWith('/my') ? { ...user, role: 'sales_agent' } : user, status: url.searchParams.get('status') || '', source: url.searchParams.get('source') || '', search: url.searchParams.get('q') || '' });
      return json(res, 200, { scope: pathname.endsWith('/my') ? 'assigned' : user.role === 'super_admin' ? 'company' : 'team', data: data.map(customerView), meta: { total: data.length, page: 1, pageSize: data.length, totalPages: data.length ? 1 : 0 } });
    }

    const customerMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
    if (customerMatch && req.method === 'GET') { if (!user) return unauthenticated(res); const customer = await repository.getCustomer(workspaceId, customerMatch[1]); if (!customer) return json(res, 404, { error: 'Customer not found' }); if (!canView(user, customer)) return deny(res, 'Access denied — customer is outside your ownership scope'); return json(res, 200, { data: customerView(customer), notes: await repository.listCustomerNotes(workspaceId, customer.id), timeline: await repository.listCustomerActivities(workspaceId, customer.id), followUps: (await repository.listCustomerFollowUps(workspaceId, customer.id)).map(followUpView) }); }
    if (customerMatch && req.method === 'DELETE') { if (!role(user, ['super_admin'], res)) return true; const customer = await repository.getCustomer(workspaceId, customerMatch[1]); if (!customer) return json(res, 404, { error: 'Customer not found' }); const deleted = await repository.deleteCustomer(workspaceId, customer.id, user); return deleted ? json(res, 200, { deleted: true, id: deleted.id }) : json(res, 404, { error: 'Customer not found' }); }
    if (customerMatch && req.method === 'PATCH') { if (!user) return unauthenticated(res); const current = await repository.getCustomer(workspaceId, customerMatch[1]); if (!current) return json(res, 404, { error: 'Customer not found' }); if (!canView(user, current)) return deny(res, 'Access denied — customer is outside your ownership scope'); const body = await readBody(req); if (body.email !== undefined && body.email && !validateEmail(String(body.email))) return json(res, 422, { error: 'Enter a valid email address.' }); if (body.phone !== undefined && !validatePhone(String(body.phone))) return json(res, 422, { error: 'Enter a valid phone number.' }); const customer = await repository.updateCustomer(workspaceId, current.id, user, body); return json(res, 200, { data: customerView(customer) }); }

    const customerStatus = pathname.match(/^\/api\/customers\/([^/]+)\/status$/);
    if (customerStatus && req.method === 'PATCH') { if (!user) return unauthenticated(res); const current = await repository.getCustomer(workspaceId, customerStatus[1]); if (!current) return json(res, 404, { error: 'Customer not found' }); if (!canView(user, current)) return deny(res, 'Access denied — customer is outside your ownership scope'); const body = await readBody(req); const allowed = ['Active', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Booking Interested', 'Closed Won', 'Closed Lost', 'Not Interested']; if (body.status && !allowed.includes(body.status)) return json(res, 400, { error: 'Invalid customer status' }); const customer = await repository.changeCustomerStatus(workspaceId, current.id, user, body.status || current.customer_status); return json(res, 200, { data: customerView(customer) }); }

    const customerAction = pathname.match(/^\/api\/customers\/([^/]+)\/(notes|timeline|follow-ups)$/);
    if (customerAction) { if (!user) return unauthenticated(res); const current = await repository.getCustomer(workspaceId, customerAction[1]); if (!current) return json(res, 404, { error: 'Customer not found' }); if (!canView(user, current)) return deny(res, 'Access denied — customer is outside your ownership scope'); const action = customerAction[2]; if (action === 'timeline' && req.method === 'GET') return json(res, 200, { data: await repository.listCustomerActivities(workspaceId, current.id) }); if (action === 'notes' && req.method === 'GET') return json(res, 200, { data: await repository.listCustomerNotes(workspaceId, current.id) }); if (action === 'notes' && req.method === 'POST') { const body = await readBody(req); const note = safeText(body.note, 2000); if (!note) return json(res, 400, { error: 'Note is required' }); return json(res, 201, { data: await repository.addCustomerNote(workspaceId, current.id, user, note) }); } if (action === 'follow-ups' && req.method === 'GET') return json(res, 200, { data: (await repository.listCustomerFollowUps(workspaceId, current.id)).map(followUpView) }); if (action === 'follow-ups' && req.method === 'POST') { const body = await readBody(req); const raw = String(body.due_date || ''); const date = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10); const time = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); const dueTime = time ? `${String((Number(time[1]) + (time[3]?.toUpperCase() === 'PM' && Number(time[1]) < 12 ? 12 : 0)).toString().padStart(2, '0'))}:${time[2]}` : '10:00'; const followUp = await repository.createFollowUp(workspaceId, user, { customer_id: current.id, lead_id: current.lead_id, follow_up_type: body.type || 'General Follow-up', due_date: date, due_time: dueTime, priority: body.priority || 'Medium', notes: body.note || '' }); return json(res, 201, { data: { id: followUp.id, type: body.type || 'Phone call', due_date: body.due_date || date, agent: followUp.assigned_agent, status: followUp.status, note: body.note || '' }, followUp: followUpView(followUp) }); } return json(res, 405, { error: 'Method not allowed' }); }

    if (req.method === 'GET' && (pathname === '/api/follow-ups' || pathname === '/api/follow-ups/my')) { if (!role(user, pathname.endsWith('/my') ? ['super_admin', 'sales_manager', 'sales_agent'] : ['super_admin', 'sales_manager'], res)) return true; const data = await repository.listFollowUps({ workspaceId, user: pathname.endsWith('/my') ? { ...user, role: 'sales_agent' } : user, includeCompleted: true }); return json(res, 200, { scope: pathname.endsWith('/my') ? 'assigned' : user.role === 'super_admin' ? 'company' : 'team', data: data.map(followUpView) }); }
    if (req.method === 'POST' && pathname === '/api/follow-ups') { if (!user) return unauthenticated(res); const body = await readBody(req); if (!body.due_date || !body.due_time || !validateIsoDate(body.due_date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.due_time))) return json(res, 400, { error: 'A valid due date and time are required' }); const item = await repository.createFollowUp(workspaceId, user, body); return item ? json(res, 201, { data: followUpView(item) }) : json(res, 400, { error: 'A valid customer or lead is required' }); }
    const followUp = pathname.match(/^\/api\/follow-ups\/([^/]+)$/); const followUpAction = pathname.match(/^\/api\/follow-ups\/([^/]+)\/(reschedule|complete|missed|cancel|notes|activity)$/);
    if (followUp || followUpAction) { if (!user) return unauthenticated(res); const identifier = (followUp || followUpAction)[1]; const item = await repository.getFollowUp(workspaceId, identifier); if (!item) return json(res, 404, { error: 'Follow-up not found' }); if (followUp && req.method === 'DELETE') { if (!role(user, ['super_admin'], res)) return true; const deleted = await repository.deleteFollowUp(workspaceId, item.id, user); return deleted ? json(res, 200, { deleted: true, id: deleted.id }) : json(res, 404, { error: 'Follow-up not found' }); } if (!canView(user, item)) return deny(res, 'Access denied — follow-up is outside your ownership scope'); if (followUp && req.method === 'GET') return json(res, 200, { data: followUpView(item), activity: await repository.listFollowUpActivities(workspaceId, item.id) }); if (followUp && req.method === 'PATCH') { const body = await readBody(req); if (body.due_date !== undefined && !validateIsoDate(body.due_date)) return json(res, 422, { error: 'Due date must use YYYY-MM-DD.' }); return json(res, 200, { data: followUpView(await repository.updateFollowUp(workspaceId, item.id, user, body)) }); } const action = followUpAction[2]; if (action === 'activity' && req.method === 'GET') return json(res, 200, { data: await repository.listFollowUpActivities(workspaceId, item.id) }); const body = await readBody(req); if (action === 'notes' && req.method === 'POST') return json(res, 201, { data: followUpView(await repository.updateFollowUp(workspaceId, item.id, user, { notes: safeText(body.note, 2000) })) }); if (action === 'reschedule' && req.method === 'PATCH') return json(res, 200, { data: followUpView(await repository.updateFollowUp(workspaceId, item.id, user, { due_date: body.due_date, due_time: body.due_time })) }); const statusMap = { complete: 'Completed', missed: 'Missed', cancel: 'Cancelled' }; if (req.method === 'PATCH' && statusMap[action]) return json(res, 200, { data: followUpView(await repository.transitionFollowUp(workspaceId, item.id, user, statusMap[action], body)) }); return json(res, 405, { error: 'Method not allowed' }); }

    if (req.method === 'GET' && pathname === '/api/notifications') { if (!user) return unauthenticated(res); const data = await repository.listNotifications(workspaceId, user.id); return json(res, 200, { data: data.map(notificationView) }); }
    const notification = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/); if (notification && req.method === 'PATCH') { if (!user) return unauthenticated(res); await repository.markNotificationRead(workspaceId, user.id, notification[1]); return json(res, 200, { ok: true }); }
    if (req.method === 'PATCH' && pathname === '/api/notifications/read-all') { if (!user) return unauthenticated(res); await repository.markAllNotificationsRead(workspaceId, user.id); return json(res, 200, { ok: true }); }

    if (req.method === 'GET' && pathname === '/api/account/login-activity') { if (!user) return unauthenticated(res); const data = await repository.loginActivity(workspaceId, user.id); return json(res, 200, { data, timezone: crmTimezone }); }
    if (req.method === 'POST' && pathname === '/api/account/change-password') {
      if (!user) return unauthenticated(res);
      const body = await readBody(req); const current = String(body.currentPassword || body.current_password || ''); const next = String(body.newPassword || body.new_password || ''); const confirm = String(body.confirmPassword || body.confirm_password || '');
      if (passwordHash(current) !== user.password_hash) return json(res, 400, { error: 'Current password is incorrect.' });
      if (!passwordPolicySatisfied(next)) return json(res, 400, { error: 'Password does not meet the configured password policy.' });
      if (next !== confirm) return json(res, 400, { error: 'Passwords do not match.' });
      if (next === current) return json(res, 400, { error: 'New password must be different from current password.' });
      const updated = await repository.changePassword(workspaceId, user.id, passwordHash(next));
      return json(res, 200, { success: true, message: 'Password changed successfully.', mustChangePassword: false, user: userManagementView(updated, updated) });
    }
    if (req.method === 'POST' && pathname === '/api/account/force-change-password') { if (!user) return unauthenticated(res); const updated=await repository.updateUser(workspaceId,user.id,{must_change_password:true}); return json(res,200,{success:true,mustChangePassword:true,user:userManagementView(user,updated||user)}); }

    if ((req.method === 'GET' || req.method === 'PATCH') && (pathname === '/api/account/me/profile' || pathname === '/api/account/me')) {
      if (!user) return unauthenticated(res);
      if (req.method === 'PATCH') {
        const body = await readBody(req); const fullName = body.fullName ?? body.full_name; const patch = {};
        if (fullName !== undefined) patch.full_name = safeText(fullName, 120);
        if (body.phone !== undefined) { if (!validatePhone(String(body.phone || ''))) return json(res, 422, { error: 'Enter a valid phone number.' }); patch.phone = String(body.phone || '').trim(); }
        if (!patch.full_name && fullName !== undefined) return json(res, 422, { error: 'Full name is required.' });
        user = await repository.updateUser(workspaceId, user.id, patch);
      }
      return json(res, 200, { user: userManagementView(user, user), timezone: crmTimezone });
    }

    if (req.method === 'GET' && pathname === '/api/chat/users') { if (!user) return unauthenticated(res); return json(res, 200, { data: await repository.listChatUsers(workspaceId, user) }); }
    if (req.method === 'POST' && pathname === '/api/chat/attachments') { if (!user) return unauthenticated(res); return json(res, 503, { error: 'Standalone attachment uploads require object storage. Send the attachment with a chat message after storage is configured.' }); }
    if (req.method === 'GET' && pathname === '/api/chat/channels') { if (!user) return unauthenticated(res); const channels = await repository.listChatChannels(workspaceId, user); const unread=(await repository.unreadCounts(workspaceId,user)).channels;const data=await Promise.all(channels.map(async channel=>{const messages=await repository.listChatMessages(workspaceId,'channel',channel.legacy_id);const last=messages[messages.length-1];return {id:channel.legacy_id,name:channel.name,description:channel.description,visibility:channel.visibility,memberIds:channel.member_ids,memberCount:channel.member_ids.length,unread:unread[channel.legacy_id]||0,lastMessage:last?{messageId:last.id,senderId:last.sender_id,senderName:last.sender?.full_name||last.sender_name,body:last.message_text,messageType:last.message_type,createdAt:last.created_at}:undefined,lastMessageAt:last?.created_at||''};}));return json(res, 200, { data }); }
    if (req.method === 'GET' && pathname === '/api/chat/groups') { if (!user) return unauthenticated(res); const groups = await repository.listChatGroups(workspaceId, user); const unread=(await repository.unreadCounts(workspaceId,user)).groups;const data=await Promise.all(groups.map(async group=>{const messages=await repository.listChatMessages(workspaceId,'group',group.legacy_id);const last=messages[messages.length-1];return {id:group.legacy_id,groupName:group.group_name,description:group.description,createdBy:group.created_by,memberIds:group.member_ids,isArchived:group.is_archived,createdAt:group.created_at,updatedAt:group.updated_at,canManage:['super_admin','sales_manager'].includes(user.role),unreadCount:unread[group.legacy_id]||0,lastMessage:last?{messageId:last.id,senderId:last.sender_id,senderName:last.sender?.full_name||last.sender_name,body:last.message_text,messageType:last.message_type,createdAt:last.created_at}:undefined,lastMessageAt:last?.created_at||''};}));return json(res, 200, { data }); }
    if (req.method === 'POST' && pathname === '/api/chat/groups') { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const body=await readBody(req);const groupName=safeText(body.groupName,100);if(!groupName)return json(res,400,{error:'Group name is required'});const group=await repository.createChatGroup(workspaceId,user,{...body,groupName,group_name:groupName});return json(res,201,{data:{id:group.legacy_id||group.id,groupName:group.group_name,description:group.description,createdBy:user.id,memberIds:group.member_ids||[user.id],isArchived:false},event:'group_created'}); }
    const groupMatch = pathname.match(/^\/api\/chat\/groups\/([^/]+)$/); if (groupMatch && (req.method === 'GET' || req.method === 'PATCH')) { if (!user) return unauthenticated(res); const groups=await repository.listChatGroups(workspaceId,user);const group=groups.find(item=>item.legacy_id===groupMatch[1]);if(!group)return json(res,404,{error:'Group chat not found'});if(req.method==='PATCH'){if(!['super_admin','sales_manager'].includes(user.role))return deny(res,'You do not have permission to manage this group');const body=await readBody(req);const updated=await repository.updateChatGroup(workspaceId,group.legacy_id,body);return json(res,200,{data:updated,event:'group_updated'})}return json(res,200,{data:group}); }
    const groupMembers = pathname.match(/^\/api\/chat\/groups\/([^/]+)\/members(?:\/([^/]+))?$/); if(groupMembers){if(!user)return unauthenticated(res);if(!['super_admin','sales_manager'].includes(user.role))return deny(res,'You do not have permission to manage members');const body=req.method==='POST'?await readBody(req):{};const updated=await repository.updateChatGroupMembers(workspaceId,groupMembers[1],body.memberIds,req.method==='DELETE'?groupMembers[2]:null);return updated?json(res,200,{data:updated,event:req.method==='DELETE'?'member_removed':'member_added'}):json(res,404,{error:'Group chat not found'});}
    const groupArchive = pathname.match(/^\/api\/chat\/groups\/([^/]+)\/archive$/); if(groupArchive&&req.method==='PATCH'){if(!user)return unauthenticated(res);if(!['super_admin','sales_manager'].includes(user.role))return deny(res,'You do not have permission to archive this group');const updated=await repository.updateChatGroup(workspaceId,groupArchive[1],{is_archived:true});return json(res,200,{data:updated,event:'group_archived'});}
    const groupMessages = pathname.match(/^\/api\/chat\/groups\/([^/]+)\/messages$/); if(groupMessages){if(!user)return unauthenticated(res);if(req.method==='GET'){const data=await repository.listChatMessages(workspaceId,'group',groupMessages[1]);if(url.searchParams.get('markRead')==='1')await repository.markChatRead(workspaceId,user,'group',groupMessages[1]);return json(res,200,{data})}if(req.method==='POST'){const body=await readBodyLimited(req,3000000);const messageText=safeText(body.message_text,4000);if(!messageText&&!body.attachment_name)return json(res,400,{error:'Message text or attachment is required'});const message=await repository.sendChatMessage(workspaceId,user,'group',groupMessages[1],{...body,message_text:messageText});return message?json(res,201,{data:message,event:'message:new'}):json(res,404,{error:'Group chat not found'});}}
    const channelMessages = pathname.match(/^\/api\/chat\/channels\/([^/]+)\/messages$/); if(channelMessages){if(!user)return unauthenticated(res);if(req.method==='GET'){const data=await repository.listChatMessages(workspaceId,'channel',channelMessages[1]);if(url.searchParams.get('markRead')==='1')await repository.markChatRead(workspaceId,user,'channel',channelMessages[1]);return json(res,200,{data})}if(req.method==='POST'){const body=await readBodyLimited(req,3000000);const messageText=safeText(body.message_text,4000);if(!messageText&&!body.attachment_name)return json(res,400,{error:'Message text or attachment is required'});const message=await repository.sendChatMessage(workspaceId,user,'channel',channelMessages[1],{...body,message_text:messageText});return message?json(res,201,{data:message,event:'message:new'}):json(res,404,{error:'Channel not found'});}}
    const chatAssets = pathname.match(/^\/api\/chat\/([^/]+)\/(attachments|links)$/); if(chatAssets){if(!user)return unauthenticated(res);const groups=await repository.listChatGroups(workspaceId,user);const channels=await repository.listChatChannels(workspaceId,user);const isGroup=groups.some(item=>item.legacy_id===chatAssets[1]);const isChannel=channels.some(item=>item.legacy_id===chatAssets[1]);if(!isGroup&&!isChannel)return json(res,404,{error:'Chat not found'});if(req.method==='GET')return json(res,200,{data:chatAssets[2]==='attachments'?await repository.listChatAttachments(workspaceId,chatAssets[1]):await repository.listChatLinks(workspaceId,chatAssets[1])});if(req.method==='POST'&&chatAssets[2]==='links'){const body=await readBody(req);const link=await repository.createChatLink(workspaceId,user,chatAssets[1],{...body,kind:isGroup?'group':'channel'});return link?json(res,201,{data:link}):json(res,400,{error:'A valid chat link is required'});}return json(res,405,{error:'Method not allowed'});}
    const messageRead = pathname.match(/^\/api\/chat\/messages\/([^/]+)\/read$/); if (messageRead && req.method === 'PATCH') { if (!user) return unauthenticated(res); await repository.markMessageRead(workspaceId,user,messageRead[1]); return json(res,200,{ok:true,read_at:new Date().toISOString()}); }
    if (req.method === 'GET' && pathname === '/api/chat/direct') { if (!user) return unauthenticated(res); return json(res, 200, { data: await repository.listDirectConversations(workspaceId, user) }); }
    const directMessages = pathname.match(/^\/api\/chat\/direct\/([^/]+)\/messages$/);
    if (directMessages) { if (!user) return unauthenticated(res); const target=await repository.findUser(workspaceId,directMessages[1]);if(!target)return json(res,404,{error:'User not found'});if(user.role!=='super_admin'&&target.team_id!==user.team_id)return deny(res,'Access denied — direct message scope'); if (req.method === 'GET') return json(res, 200, { data: await repository.listDirectMessages(workspaceId, user, directMessages[1]) }); if (req.method === 'POST') { const body=await readBodyLimited(req,3000000);const messageText=safeText(body.message_text,4000);if(!messageText&&!body.attachment_name)return json(res,400,{error:'Message text or attachment is required'});const message=await repository.sendDirectMessage(workspaceId,user,directMessages[1],{...body,message_text:messageText});return message?json(res,201,{data:message,event:'message:new'}):json(res,404,{error:'Recipient not found'}); } return json(res,405,{error:'Method not allowed'}); }
    if (req.method === 'GET' && pathname === '/api/chat/unread-counts') { if (!user) return unauthenticated(res); return json(res, 200, { data: await repository.unreadCounts(workspaceId, user) }); }

    if (req.method === 'GET' && pathname === '/api/users/teams') { if (!user) return unauthenticated(res); const data=(await repository.listTeams(workspaceId)).map(team=>({...team,id:team.legacy_id||team.id})); return json(res, 200, { data }); }
    if (req.method === 'GET' && pathname === '/api/users/me') { if (!user) return unauthenticated(res); return json(res, 200, { user: publicUser(user) }); }
    if (req.method === 'GET' && pathname === '/api/users') { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const query=String(url.searchParams.get('search')||'').toLowerCase();const roleFilter=url.searchParams.get('role')||'';const statusFilter=String(url.searchParams.get('status')||'').toLowerCase();const teamFilter=url.searchParams.get('teamId')||'';let data=await repository.listUsers(workspaceId,user);data=data.filter(item=>(!query||[item.full_name,item.email,item.phone].some(value=>String(value||'').toLowerCase().includes(query)))&&(!roleFilter||item.role===roleFilter)&&(!statusFilter||item.status===statusFilter||item.status===statusFilter.replace(/\s+/g,'_'))&&(!teamFilter||item.team_id===teamFilter));return json(res, 200, { data: data.map(item => userManagementView(user, item)), teams:(await repository.listTeams(workspaceId)).map(team=>({...team,id:team.legacy_id||team.id})), meta:{total:data.length,page:1,pageSize:data.length||25,totalPages:data.length?1:0}, timezone:crmTimezone }); }
    if (req.method === 'GET' && pathname === '/api/agents') { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const data = (await repository.listUsers(workspaceId, user)).filter(item => ['sales_agent', 'sales_manager'].includes(item.role)); const rows = await repository.reportRows(workspaceId, user); return json(res, 200, { data: data.map(item => ({ ...publicUser(item), ...(rows.find(row => row.agentId === item.id) || {}), teamId: item.team_id })) }); }
    const managedRead = pathname.match(/^\/api\/(users|agents)\/([^/]+)(?:\/(leads|follow-ups|customers|activity|audit-log))?$/);
    if (managedRead && req.method === 'GET') { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const target=await repository.findUser(workspaceId,managedRead[2]);if(!target)return json(res,404,{error:'User not found'});if(user.role==='sales_manager'&&target.team_id!==user.team_id)return deny(res,'Access denied — user is outside your team');const tab=managedRead[3];if(tab==='leads')return json(res,200,{data:(await repository.listLeads({workspaceId,user:{role:'super_admin'}})).filter(item=>item.assigned_agent_id===target.id).map(leadView)});if(tab==='follow-ups')return json(res,200,{data:(await repository.listFollowUps({workspaceId,user:{role:'super_admin'}})).filter(item=>item.assigned_agent_id===target.id).map(followUpView)});if(tab==='customers')return json(res,200,{data:(await repository.listCustomers({workspaceId,user:{role:'super_admin'}})).filter(item=>item.assigned_agent_id===target.id).map(customerView)});const activity=await repository.userActivity(workspaceId,target.id);if(tab==='activity')return json(res,200,{data:activity});if(tab==='audit-log')return json(res,200,{data:activity,auditLogs:activity});const management=userManagementView(user,target);const auditLogs=activity.map(item=>({...item,createdAt:item.created_at,actorUserId:item.actor_user_id||null,actorName:item.actor_name||'Aureum workspace',action:item.action||item.activity_type,description:item.description||item.action||item.activity_type}));if(managedRead[1]==='agents'){const row=(await repository.reportRows(workspaceId,user)).find(item=>item.agentId===target.id)||{};return json(res,200,{user:management,data:{...publicUser(target),...row,full_name:target.full_name,team:target.team_id||'Unassigned',status:target.status}});}return json(res,200,{user:management,auditLogs,data:management}); }
    if (req.method === 'POST' && (pathname === '/api/users' || pathname === '/api/agents')) { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const body=await readBody(req);const roleKey=body.role||'sales_agent';const fullName=safeText(body.fullName||body.full_name,120);const email=safeText(body.email,160).toLowerCase();const phone=safeText(body.phone,32);const temporaryPassword=String(body.temporaryPassword||body.password||`Aureum${crypto.randomBytes(4).toString('hex').toUpperCase()}!9`);const status=String(body.status||'pending').toLowerCase().replace(/\s+/g,'_');const teamId=body.teamId||body.team_id||(user.role==='sales_manager'?user.team_id:null);if(!fullName||!validateEmail(email)||!['sales_agent','sales_manager'].includes(roleKey)||(user.role==='sales_manager'&&roleKey!=='sales_agent'))return json(res,400,{error:'Name, email, and an allowed role are required'});if(phone&&!validatePhone(phone))return json(res,422,{error:'Enter a valid phone number.'});if(!passwordPolicySatisfied(temporaryPassword))return json(res,422,{error:'Temporary password does not meet the password policy.'});try{const created=await repository.createUser(workspaceId,user,{...body,full_name:fullName,email,phone,team_id:teamId,role:roleKey,password_hash:passwordHash(temporaryPassword),status:['active','inactive','pending','suspended'].includes(status)?status:'pending',must_change_password:body.requirePasswordChangeOnFirstLogin!==false});return json(res,201,{user:userManagementView(user,created),data:created,email:{success:false,status:'draft',message:'Email delivery is not configured; connect an email provider before sending access credentials.'}});}catch(error){if(error.code==='23505')return json(res,409,{error:'Email already exists'});throw error;} }
    const managedAction = pathname.match(/^\/api\/users\/([^/]+)\/(send-access-email|resend-access-email|reset-password)$/);
    if (managedAction && req.method === 'POST') { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const target=await repository.findUser(workspaceId,managedAction[1]);if(!target)return json(res,404,{error:'User not found'});if(user.role==='sales_manager'&&target.team_id!==user.team_id)return deny(res,'Access denied — user is outside your team');const temporary=`Aureum${crypto.randomBytes(4).toString('hex').toUpperCase()}!9`;const expiresAt=new Date(Date.now()+72*60*60*1000).toISOString();const updated=await repository.updateUser(workspaceId,target.id,{password_hash:passwordHash(temporary),status:'active',must_change_password:true});const invited=await repository.issueUserInvite(workspaceId,user,target.id,crypto.createHash('sha256').update(temporary).digest('hex'),expiresAt);return json(res,200,{user:userManagementView(user,invited||updated),email:{success:false,status:'draft',message:'Email delivery is not configured; connect an email provider before sending access credentials.'}}); }
    const managedUser = pathname.match(/^\/api\/(users|agents)\/([^/]+)(?:\/(status|team|leads|follow-ups|customers|activity))?$/);
    if (managedUser && req.method === 'DELETE' && managedUser[1] === 'users') { if (!role(user, ['super_admin'], res)) return true; const target = await repository.findUser(workspaceId, managedUser[2]); if (!target) return json(res, 404, { error: 'User not found' }); if (target.id === user.id) return deny(res, 'You cannot delete your own account.'); if (target.role === 'super_admin') return deny(res, 'Super Admin accounts cannot be deleted.'); const deleted = await repository.deleteUser(workspaceId, target.id, user); return deleted ? json(res, 200, { deleted: true, user: { id: deleted.id, fullName: deleted.full_name, email: deleted.email } }) : json(res, 404, { error: 'User not found' }); }
    if (managedUser && req.method === 'PATCH' && ['users','agents'].includes(managedUser[1])) { if (!role(user, ['super_admin','sales_manager'], res)) return true; const target=await repository.findUser(workspaceId,managedUser[2]);if(!target)return json(res,404,{error:'User not found'});if(user.role==='sales_manager'&&(target.team_id!==user.team_id||target.role!=='sales_agent'))return deny(res,'Managers can only edit team sales agents');if(managedUser[3]==='status'&&target.id===user.id)return deny(res,'You cannot change your own account status.');const body=await readBody(req);if(user.role==='sales_manager'&&body.role==='super_admin')return deny(res,'Managers cannot promote users to Super Admin');const patch={...body};if(body.fullName!==undefined)patch.full_name=body.fullName;if(body.teamId!==undefined)patch.team_id=body.teamId;if(body.password)patch.password_hash=passwordHash(body.password);if(body.status!==undefined)patch.status=String(body.status).toLowerCase().replace(/\s+/g,'_');delete patch.fullName;delete patch.teamId;const updated=await repository.updateUser(workspaceId,managedUser[2],patch);return updated?json(res,200,{user:userManagementView(user,updated),data:updated}):json(res,404,{error:'User not found'}); }

    const pref = pathname.match(/^\/api\/account\/preferences\/(notifications|appearance|display)$/); if (pref && (req.method === 'GET' || req.method === 'PATCH')) { if (!user) return unauthenticated(res); const key=pref[1]; if(req.method==='PATCH'){const body=await readBody(req);const current=await repository.accountPreferences(workspaceId,user.id);await repository.updateAccountPreferences(workspaceId,user.id,key,{...(current[key]||{}),...body});}const current=await repository.accountPreferences(workspaceId,user.id);return json(res,200,{data:{...(current[key]||{}),...(key==='display'?{timezone:crmTimezone}:{})}}); }

    if (req.method === 'GET' && pathname === '/api/search') { if (!user) return unauthenticated(res); const query=String(url.searchParams.get('q')||'').trim(); if(query.length<2)return json(res,200,{data:{leads:[],customers:[],followUps:[]}}); return json(res,200,{data:searchView(await repository.search(workspaceId,user,query))}); }
    if (req.method === 'GET' && pathname === '/api/activity-logs') { if (!user) return unauthenticated(res); return json(res,200,{data:await repository.auditEvents(workspaceId)}); }

    const dashboardRoutes = new Set(['/api/dashboard/summary','/api/dashboard/lead-inflow','/api/dashboard/lead-sources','/api/dashboard/follow-up-performance','/api/dashboard/conversion-overview','/api/dashboard/recent-leads','/api/dashboard/today-follow-ups','/api/dashboard/agent-performance']);
     if (req.method === 'GET' && dashboardRoutes.has(pathname)) { if (!user) return unauthenticated(res); if (pathname === '/api/dashboard/agent-performance' && !role(user, ['super_admin', 'sales_manager'], res)) return true; const report=await reportData(user,Object.fromEntries(url.searchParams.entries())); const key=pathname.split('/').pop(); const data=key==='summary'?report.summary:key==='lead-inflow'?report.leadInflow:key==='lead-sources'?report.charts.leadSourcePerformance.map(item=>({ name:item.label, source:item.label, value:item.value, count:item.value, percentage:report.leadReport.totalLeads ? Number((item.value / report.leadReport.totalLeads * 100).toFixed(1)) : 0 })):key==='follow-up-performance'?report.charts.followUpStatusPerformance.map(item=>({ name:item.label, status:item.label, value:item.value, count:item.value })):key==='conversion-overview'?report.charts.conversionOverview:key==='recent-leads'?(await repository.listLeads({workspaceId,user})).slice(0,10).map(leadView):key==='today-follow-ups'?(await repository.listFollowUps({workspaceId,user})).filter(item=>item.due_date===localDate()).map(followUpView):report.agentReports.filter(item => item.presenceStatus === 'Online'); return json(res,200,{scope:report.scope,data}); }

    if (pathname === '/api/settings/webhooks' || pathname.startsWith('/api/settings/webhooks/')) {
      if (!role(user, ['super_admin'], res)) return true;
      if (req.method === 'GET' && pathname === '/api/settings/webhooks') { const data=(await repository.listWebhookConnections(workspaceId)).map(webhookView); return json(res,200,{data,meta:{total:data.length}}); }
      if (req.method === 'POST' && pathname === '/api/settings/webhooks') { const body=await readBody(req); if(!safeText(body.connectionName||body.connection_name,120))return json(res,422,{error:'Connection name is required'}); const secret=`aureum_wh_${require('node:crypto').randomBytes(24).toString('hex')}`;const created=await repository.createWebhookConnection(workspaceId,user,{...body,secret,secret_hash:require('node:crypto').createHash('sha256').update(secret).digest('hex')});return json(res,201,{data:webhookView(created),secretToken:secret,message:'Copy this secret now. It will not be shown again.'}); }
      const failedPath=pathname==='/api/settings/webhooks/failed-leads'; if(failedPath&&req.method==='GET')return json(res,200,{data:await repository.listFailedWebhookLeads(workspaceId)});
      const failedMatch=pathname.match(/^\/api\/settings\/webhooks\/failed-leads\/([^/]+)\/convert$/); if(failedMatch&&req.method==='POST'){const item=await repository.convertFailedWebhookLead(workspaceId,failedMatch[1],user);return item?json(res,200,{data:leadView(item)}):json(res,404,{error:'Failed webhook lead could not be converted.'});}
      const detail=pathname.match(/^\/api\/settings\/webhooks\/([^/]+)$/); if(detail&&req.method==='GET'){const item=await repository.getWebhookConnection(workspaceId,detail[1]);return item?json(res,200,{data:webhookView(item)}):json(res,404,{error:'Webhook connection not found.'});}
      if(detail&&req.method==='PATCH'){const body=await readBody(req);const updated=await repository.updateWebhookConnection(workspaceId,detail[1],body);return updated?json(res,200,{data:webhookView(updated)}):json(res,404,{error:'Webhook connection not found.'});}
      const logs=pathname.match(/^\/api\/settings\/webhooks\/([^/]+)\/logs$/); if(logs&&req.method==='GET')return json(res,200,{data:await repository.listWebhookLogs(workspaceId,logs[1])});
      const mappings=pathname.match(/^\/api\/settings\/webhooks\/([^/]+)\/field-mappings$/); if(mappings){if(req.method==='GET'){const item=await repository.getWebhookConnection(workspaceId,mappings[1]);return item?json(res,200,{data:item.field_mappings||{}}):json(res,404,{error:'Webhook connection not found.'});}if(req.method==='PATCH'){const body=await readBody(req);const updated=await repository.updateWebhookConnection(workspaceId,mappings[1],{fieldMappings:body.mappings||{}});return updated?json(res,200,{data:updated.field_mappings||{}}):json(res,404,{error:'Webhook connection not found.'});}}
      const action=pathname.match(/^\/api\/settings\/webhooks\/([^/]+)\/(enable|disable|regenerate-secret|test|test-payload)$/); if(action){const id=action[1],kind=action[2];if(kind==='enable'||kind==='disable'){const updated=await repository.updateWebhookConnection(workspaceId,id,{status:kind==='enable'?'active':'inactive'});return updated?json(res,200,{data:webhookView(updated)}):json(res,404,{error:'Webhook connection not found.'});}if(kind==='regenerate-secret'){const secret=`aureum_wh_${require('node:crypto').randomBytes(24).toString('hex')}`;const updated=await repository.updateWebhookConnection(workspaceId,id,{secret_hash:require('node:crypto').createHash('sha256').update(secret).digest('hex')});return updated?json(res,200,{data:webhookView(updated),secretToken:secret,message:'Copy this secret now. The previous secret is invalid.'}):json(res,404,{error:'Webhook connection not found.'});}if(kind==='test-payload'){const body=await readBody(req);const preview=await repository.previewWebhookLead(workspaceId,id,body.payload||body);return preview.ok?json(res,200,{data:{normalizedLead:preview.normalizedLead,duplicate:Boolean(preview.duplicate),existingLead:preview.existingLead||null}}):json(res,preview.status||422,{error:preview.error});}if(kind==='test'){const updated=await repository.updateWebhookConnection(workspaceId,id,{status:'active'});return updated?json(res,200,{data:{success:true,message:'Connection test passed. The connection is active.'}}):json(res,404,{error:'Webhook connection not found.'});}}
      return json(res,404,{error:'Webhook route not found.'});
    }
    const reportAgent = pathname.match(/^\/api\/reports\/agents\/([^/]+)(?:\/(leads|follow-ups|customers|activity))?$/);
    if (req.method === 'GET' && reportAgent) { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const detail=await reportAgentDetail(user,reportAgent[1],Object.fromEntries(url.searchParams.entries()));if(!detail)return json(res,404,{error:'Agent report not found in your permitted scope'});const tab=reportAgent[2];if(tab==='leads')return json(res,200,{data:detail.leads});if(tab==='follow-ups')return json(res,200,{data:detail.followUps});if(tab==='customers')return json(res,200,{data:detail.customers});if(tab==='activity')return json(res,200,{data:detail.activity});return json(res,200,{data:detail}); }
    if (req.method === 'GET' && ['/api/reports','/api/reports/summary','/api/reports/agents','/api/reports/leads','/api/reports/customers','/api/reports/follow-ups','/api/reports/conversion-overview'].includes(pathname)) { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const report=await reportData(user,Object.fromEntries(url.searchParams.entries())); if(pathname==='/api/reports/summary')return json(res,200,{scope:report.scope,data:report.summary,meta:report.meta}); if(pathname==='/api/reports/agents')return json(res,200,{data:report.agentReports,meta:report.meta}); if(pathname==='/api/reports/leads')return json(res,200,{data:report.leadReport}); if(pathname==='/api/reports/customers')return json(res,200,{data:report.customerReport}); if(pathname==='/api/reports/follow-ups')return json(res,200,{data:report.followUpReport}); if(pathname==='/api/reports/conversion-overview')return json(res,200,{data:report.charts.conversionOverview}); return json(res,200,{requestedBy:user.role,data:report}); }
    if (req.method === 'POST' && pathname === '/api/reports/export') { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const report=await reportData(user); const csv=['Agent,Role,Assigned Leads,Follow-ups Completed,Overdue Follow-ups,Closed Deals,Conversion Rate',...report.agentReports.map(row=>[row.agentName,row.agentRole,row.assignedLeads,row.followUpsCompleted,row.overdueFollowUps,row.closedDeals,`${row.conversionRate}%`].map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(','))].join('\n'); res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="aureum-agent-report.csv"'});res.end(csv);return true; }
    if (req.method === 'GET' && /^\/api\/reports\/export\/(pdf|excel)$/.test(pathname)) { if (!role(user, ['super_admin', 'sales_manager'], res)) return true; const report=await reportData(user); const csv=['Agent,Role,Assigned Leads,Follow-ups Completed,Overdue Follow-ups,Closed Deals,Conversion Rate',...report.agentReports.map(row=>[row.agentName,row.agentRole,row.assignedLeads,row.followUpsCompleted,row.overdueFollowUps,row.closedDeals,`${row.conversionRate}%`].join(','))].join('\n');res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="aureum-agent-report.csv"'});res.end(csv);return true; }

    if ((pathname === '/api/settings' || pathname.startsWith('/api/settings/')) && !pathname.startsWith('/api/settings/webhooks')) {
      if (!role(user, ['super_admin'], res)) return true;
      const settings = await repository.workspaceSettings(workspaceId);
      if (req.method === 'GET' && pathname === '/api/settings') return json(res, 200, { requestedBy: user.role, data: { company: settings.company || {}, preferences: settings.preferences || {}, security: settings.security || {}, emailAccess: settings.email_access || {} } });
      const settingRoute = pathname.match(/^\/api\/settings\/(company|preferences|security|email-access)$/);
      if (settingRoute && req.method === 'GET') { const key=settingRoute[1].replace('-', '_'); return json(res,200,{data:settings[key]||{}}); }
      if (settingRoute && req.method === 'PATCH') { const body=await readBody(req); const key=settingRoute[1].replace('-', '_'); const merged={...(settings[key]||{}),...body}; await repository.updateWorkspaceSetting(workspaceId,key,merged); return json(res,200,{data:merged}); }
      if (pathname === '/api/settings/notifications' && req.method === 'GET') return json(res,200,{data:await repository.listNotificationSettings(workspaceId,user.id)});
      if (pathname === '/api/settings/notifications' && req.method === 'PATCH') { const body=await readBody(req); const updates=Array.isArray(body.notifications)?body.notifications:[body]; return json(res,200,{data:await repository.updateNotificationSettings(workspaceId,user.id,updates)}); }
      if (pathname === '/api/settings/permissions' && req.method === 'GET') { const roles={super_admin:'SUPER_ADMIN',sales_manager:'SALES_MANAGER',sales_agent:'SALES_AGENT'}; const permissions=Object.entries(rolePermissions).flatMap(([roleKey,items])=>(Array.isArray(items)?items:Object.keys(items||{})).map(key=>({key,role:roleKey,allowed:true}))); return json(res,200,{roles,data:permissions}); }
      if (pathname === '/api/settings/activities' && req.method === 'GET') return json(res,200,{data:await repository.settingsActivities(workspaceId)});
      const configuration = pathname.match(/^\/api\/settings\/(lead-statuses|lead-tags|lead-sources)$/);
      if (configuration && req.method === 'GET') return json(res,200,{data:await repository.listLeadConfiguration(workspaceId,configuration[1])});
      if (configuration && req.method === 'POST') { const body=await readBody(req); if(!safeText(body.name,120))return json(res,422,{error:'Name is required'}); try { const item=await repository.createLeadConfiguration(workspaceId,configuration[1],body); return json(res,201,{data:item}); } catch(error) { if(error.code==='23505')return json(res,409,{error:'That name already exists'}); throw error; } }
      const configurationItem = pathname.match(/^\/api\/settings\/(lead-statuses|lead-tags|lead-sources)\/([^/]+)(?:\/status)?$/);
      if (configurationItem && req.method === 'PATCH') { const body=await readBody(req); const item=await repository.updateLeadConfiguration(workspaceId,configurationItem[1],configurationItem[2],body); return item?json(res,200,{data:item}):json(res,404,{error:'Setting item not found'}); }
      return json(res, 404, { error: 'Settings route not found' });
    }
    return false;
  }

  return { handle };
}

module.exports = { createRelationalApi };
