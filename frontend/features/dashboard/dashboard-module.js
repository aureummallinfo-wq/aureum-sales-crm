// Dashboard module: role-aware data contracts, API hooks, and presentation.
// The project is intentionally buildless, so charts use semantic SVG/CSS primitives
// instead of a runtime chart dependency while keeping the same API-ready boundaries.

const dashboardMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dashboardStatuses = ['Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled'];
const dashboardStages = ['New', 'Contacted', 'Qualified', 'Follow-up', 'Negotiation', 'Booking', 'Closed Won'];
const DASHBOARD_CACHE_TTL_MS = 30 * 1000;
const dashboardSummaryCache = new Map();
let dashboardPresenceTimer = null;
state.dashboardDateRange = state.dashboardDateRange || 'this_month';
state.dashboardCustomStart = state.dashboardCustomStart || '';
state.dashboardCustomEnd = state.dashboardCustomEnd || '';
state.dashboardRecentLeadAgentId = state.dashboardRecentLeadAgentId || '';
const priorAgentFilter = state.dashboardAgentFilter;
state.dashboardAgentFilter = priorAgentFilter === '*' ? ['*'] : Array.isArray(priorAgentFilter) ? priorAgentFilter : priorAgentFilter ? [priorAgentFilter] : [];

const dashboardRoleConfig = {
  SUPER_ADMIN: { role: 'super_admin', scope: 'company', scopeLabel: 'Company-wide data', welcome: 'Welcome back, Super Admin', welcomeCopy: 'Track company-wide leads, follow-ups, users, and sales performance.', quickActions: [['add-lead', 'Add New Lead'], ['leads', 'View All Leads'], ['reports', 'View Reports'], ['agents', 'Manage Users'], ['follow-ups', 'View Follow-ups']] },
  SALES_MANAGER: { role: 'sales_manager', scope: 'team', scopeLabel: 'Team data', welcome: 'Welcome back, Sales Manager', welcomeCopy: 'Monitor team leads, follow-ups, users, and sales progress.', quickActions: [['add-lead', 'Add New Lead'], ['leads', 'View All Leads'], ['follow-ups', 'View Follow-ups'], ['reports', 'View Reports'], ['agents', 'View Users']] },
  SALES_AGENT: { role: 'sales_agent', scope: 'own', scopeLabel: 'My data only', welcome: 'Welcome back, Sales Agent', welcomeCopy: 'Manage your assigned leads, customers, and follow-ups for today.', quickActions: [['add-lead', 'Add New Lead'], ['my-leads', 'View My Leads'], ['follow-ups', 'View Follow-ups'], ['customers', 'Open Customers'], ['team-chat', 'Team Chat']] }
};

function dashboardRole() { return dashboardRoleConfig[state.role] || dashboardRoleConfig.SALES_AGENT; }
function dashboardWelcomeName(role = dashboardRole()) {
  const configuredFallback = String(role.welcome || '').replace(/^Welcome back,\s*/i, '').trim();
  return dashboardSafeString(dashboardValue(state.authUser, ['full_name', 'fullName', 'name'], null), configuredFallback || 'Aureum user');
}
function dashboardChartColors() { return window.aureumDashboardChartColors || { gold: '#C6A15B', softGold: '#E2C67A', deepBrown: '#2A2118', softBeige: '#EFE4D2', success: '#2F6B4F', warning: '#C88A2D', error: '#B94A48', muted: '#7A7167' }; }
function dashboardEscape(value) { return window.AureumUI?.escape ? AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function dashboardSafeString(value, fallback = 'N/A') { if (value === null || value === undefined) return fallback; const text = String(value).trim(); return text || fallback; }
function dashboardNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function dashboardSafeArray(value) { return Array.isArray(value) ? value : []; }
function dashboardValue(record, keys, fallback) { const source = record && typeof record === 'object' ? record : {}; for (const key of keys) { if (source[key] !== null && source[key] !== undefined && String(source[key]).trim() !== '') return source[key]; } return fallback; }
function dashboardLeadName(record) { return dashboardSafeString(dashboardValue(record, ['leadName', 'lead_name', 'name', 'customerName', 'customer_name', 'fullName', 'full_name'], null), 'Unknown Lead'); }
function dashboardCustomerName(record) { return dashboardSafeString(dashboardValue(record, ['customerName', 'customer_name', 'name', 'fullName', 'full_name'], null), 'Unknown Customer'); }
function dashboardAgentName(record) { return dashboardSafeString(dashboardValue(record, ['agentName', 'agent_name', 'assignedAgent', 'assigned_agent', 'assignedTo', 'assigned_to', 'agent'], null), 'Unassigned'); }
function dashboardInitials(value, fallback = 'UL') { const name = dashboardSafeString(value, ''); if (!name) return fallback; const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join(''); return initials || fallback; }
function dashboardRecordStatus(record) { return dashboardSafeString(dashboardValue(record, ['status', 'state', 'leadStatus', 'lead_status'], null), 'Unknown'); }
function dashboardRecordDate(record) { return dashboardSafeString(dashboardValue(record, ['createdAt', 'created_at', 'created', 'date', 'occurredAt', 'occurred_at'], null), 'No date'); }
function dashboardPresenceStatus(record) {
  const explicit = String(dashboardValue(record, ['presenceStatus', 'presence_status', 'activityStatus', 'activity_status'], '') || '').trim().toLowerCase();
  if (['online', 'away', 'offline'].includes(explicit)) return explicit;
  const lastActivity = Date.parse(dashboardValue(record, ['lastActivityAt', 'last_activity_at', 'lastActivity', 'last_activity'], '') || '');
  if (!Number.isFinite(lastActivity)) return 'offline';
  const age = Math.max(0, Date.now() - lastActivity);
  return age <= 2 * 60 * 1000 ? 'online' : age <= 15 * 60 * 1000 ? 'away' : 'offline';
}
function dashboardRelativeTime(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 'unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function dashboardCacheKey() { return [dashboardRole().role, dashboardRole().scope, state.dashboardDateRange, state.dashboardCustomStart || '', state.dashboardCustomEnd || '', state.dashboardRecentLeadAgentId || ''].join('|'); }
function dashboardCacheableData(data) { return { role: data.role, scope: data.scope, dateRange: data.dateRange, summary: { ...data.summary }, leadInflow: dashboardSafeArray(data.leadInflow).map(item => ({ ...item })), leadSources: dashboardSafeArray(data.leadSources).map(item => ({ ...item })), followUpPerformance: dashboardSafeArray(data.followUpPerformance).map(item => ({ ...item })), conversionOverview: dashboardSafeArray(data.conversionOverview).map(item => ({ ...item })), agentPerformance: dashboardSafeArray(data.agentPerformance).map(item => ({ ...item })), recentLeads: dashboardSafeArray(data.recentLeads).map(item => ({ ...item })), recentActivities: dashboardSafeArray(data.recentActivities).map(item => ({ ...item })), todayFollowUps: dashboardSafeArray(data.todayFollowUps).map(item => ({ ...item })), scopeLabel: data.scopeLabel, meta: { ...data.meta } }; }
function dashboardReadCache(key = dashboardCacheKey()) { const entry = dashboardSummaryCache.get(key); if (!entry || entry.expiresAt <= Date.now()) { dashboardSummaryCache.delete(key); return null; } return normalizeDashboardData(entry.data); }
function dashboardWriteCache(data, key = dashboardCacheKey()) { dashboardSummaryCache.set(key, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, data: dashboardCacheableData(data) }); }
function invalidateDashboardCache() { dashboardSummaryCache.clear(); }
function dashboardPercent(value, total) { const amount = dashboardNumber(value); const denominator = dashboardNumber(total); return denominator ? (amount / denominator) * 100 : 0; }
function dashboardFormatNumber(value) { return dashboardNumber(value).toLocaleString(); }
function dashboardCountLabel(value, singular) { const amount = dashboardNumber(value); return `${dashboardFormatNumber(amount)} ${singular}${amount === 1 ? '' : 's'}`; }
function dashboardTooltipText(title, lines = []) { return [title, ...lines].filter(Boolean).join(' · '); }
function dashboardTooltip(title, lines = []) { return `<span class="dashboard-chart-tooltip" aria-hidden="true"><strong>${dashboardEscape(dashboardSafeString(title))}</strong>${dashboardSafeArray(lines).map(line => `<span>${dashboardEscape(dashboardSafeString(line))}</span>`).join('')}</span>`; }

function dashboardKpiTarget(id, role) {
  const agent = role === 'SALES_AGENT';
  return { 'total-leads': [agent ? 'my-leads' : 'leads'], 'new-leads': [agent ? 'my-leads' : 'leads', 'New'], 'hot-leads': [agent ? 'my-leads' : 'leads', 'Hot'], 'follow-ups-due': ['follow-ups', 'today'], 'overdue-follow-ups': ['follow-ups', 'overdue'], 'active-customers': ['customers'], 'closed-deals': [agent ? 'my-leads' : 'leads', 'Closed Won'], 'conversion-rate': ['reports'], 'my-leads': ['my-leads'], 'my-hot-leads': ['my-leads', 'Hot'], 'my-follow-ups': ['follow-ups', 'today'], 'my-overdue': ['follow-ups', 'overdue'], 'my-customers': ['customers'], 'my-closed-deals': ['my-leads', 'Closed Won'] }[id] || ['dashboard'];
}

function dashboardSummaryKpis(summary, role) {
  const isAgent = role === 'SALES_AGENT';
  const cards = isAgent ? [
    ['my-leads', 'My Leads', summary.myLeads ?? summary.totalLeads, 'Assigned pipeline', 'gold'],
    ['my-hot-leads', 'My Hot Leads', summary.myHotLeads ?? summary.hotLeads, 'High purchase intent', 'warning'],
    ['my-follow-ups', 'My Follow-ups Today', summary.myFollowUpsToday ?? summary.followUpsDue, 'Scheduled touchpoints', 'default'],
    ['my-overdue', 'My Overdue Follow-ups', summary.myOverdueFollowUps ?? summary.overdueFollowUps, 'Needs recovery', 'danger'],
    ['my-customers', 'My Customers', summary.myCustomers ?? summary.activeCustomers, 'Assigned relationships', 'success'],
    ['my-closed-deals', 'My Closed Deals', summary.myClosedDeals ?? summary.closedDeals, 'Won opportunities', 'gold']
  ] : [
    ['total-leads', role === 'SALES_MANAGER' ? 'Team Leads' : 'Total Leads', summary.totalLeads, role === 'SALES_MANAGER' ? 'Visible team pipeline' : 'All active CRM leads', 'gold'],
    ['new-leads', role === 'SALES_MANAGER' ? 'New Team Leads' : 'New Leads', summary.newLeads, 'Current intake', 'default'],
    ['hot-leads', role === 'SALES_MANAGER' ? 'Hot Team Leads' : 'Hot Leads', summary.hotLeads, 'High purchase intent', 'warning'],
    ['follow-ups-due', role === 'SALES_MANAGER' ? 'Team Follow-ups Due' : 'Follow-ups Due', summary.followUpsDue, 'Scheduled touchpoints', 'default'],
    ['overdue-follow-ups', role === 'SALES_MANAGER' ? 'Team Overdue Follow-ups' : 'Overdue Follow-ups', summary.overdueFollowUps, 'Action required', 'danger'],
    ['active-customers', role === 'SALES_MANAGER' ? 'Team Customers' : 'Active Customers', summary.activeCustomers, 'Active relationships', 'success'],
    ['closed-deals', role === 'SALES_MANAGER' ? 'Team Closed Deals' : 'Closed Deals', summary.closedDeals, summary.bookingVolume || 'Won opportunities', 'gold'],
    ['conversion-rate', role === 'SALES_MANAGER' ? 'Team Conversion Rate' : 'Conversion Rate', `${dashboardNumber(summary.conversionRate).toFixed(1)}%`, 'Pipeline efficiency', 'success']
  ];
  return cards.map(([id, title, value, subtitle, variant], index) => { const [screen, filter = ''] = dashboardKpiTarget(id, role); return `<article class="dashboard-stat-card dashboard-stat-${variant}" data-dashboard-kpi="${id}" data-dashboard-kpi-screen="${screen}" data-dashboard-kpi-filter="${filter}" role="button" tabindex="0" aria-label="Open ${dashboardEscape(title)}"><div class="dashboard-stat-icon">${['◈', '✦', '◷', '!', '♢', '✓', '◆', '%'][index % 8]}</div><div><div class="dashboard-stat-title">${title}</div><div class="dashboard-stat-value">${dashboardEscape(value ?? '—')}</div><div class="dashboard-stat-subtitle">${dashboardEscape(subtitle)}</div></div></article>`; }).join('');
}

function dashboardDateRangeLabel() { return ({ today: 'Today', this_week: 'This Week', this_month: 'This Month', last_month: 'Last Month', custom: 'Custom Range' }[state.dashboardDateRange] || 'This Month'); }
function dashboardDateFilter() { const custom = state.dashboardDateRange === 'custom'; return `<div class="dashboard-date-filter"><label>View range <select data-dashboard-date-range aria-label="Dashboard date range"><option value="today" ${state.dashboardDateRange === 'today' ? 'selected' : ''}>Today</option><option value="this_week" ${state.dashboardDateRange === 'this_week' ? 'selected' : ''}>This Week</option><option value="this_month" ${state.dashboardDateRange === 'this_month' ? 'selected' : ''}>This Month</option><option value="last_month" ${state.dashboardDateRange === 'last_month' ? 'selected' : ''}>Last Month</option><option value="custom" ${custom ? 'selected' : ''}>Custom Range</option></select></label>${custom ? `<label>Start Date<input type="date" data-dashboard-start value="${dashboardEscape(state.dashboardCustomStart)}" /></label><label>End Date<input type="date" data-dashboard-end value="${dashboardEscape(state.dashboardCustomEnd)}" /></label><button class="btn btn-gold btn-sm" data-dashboard-apply-range>Apply</button><button class="btn btn-secondary btn-sm" data-dashboard-clear-range>Clear</button>` : ''}</div>`; }
function dashboardFilterDate(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return false; const today = new Date(); today.setHours(0, 0, 0, 0); const start = new Date(today); const end = new Date(today); if (state.dashboardDateRange === 'today') { end.setHours(23, 59, 59, 999); } else if (state.dashboardDateRange === 'this_week') { start.setDate(today.getDate() - today.getDay()); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999); } else if (state.dashboardDateRange === 'last_month') { start.setMonth(today.getMonth() - 1, 1); end.setMonth(today.getMonth(), 0); end.setHours(23, 59, 59, 999); } else if (state.dashboardDateRange === 'custom') { const customStart = state.dashboardCustomStart ? new Date(`${state.dashboardCustomStart}T00:00:00`) : null; const customEnd = state.dashboardCustomEnd ? new Date(`${state.dashboardCustomEnd}T23:59:59`) : null; return (!customStart || date >= customStart) && (!customEnd || date <= customEnd); } else { return true; } return date >= start && date <= end; }
// The API returns already-scoped and date-bounded dashboard records. Do not apply a
// second browser-local filter: dueTime is intentionally time-only and would make
// valid follow-ups disappear for non-default ranges.
function dashboardFilteredRecords(data) { return data; }

function normalizeDashboardData(raw = {}) {
  const source = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : (raw && typeof raw === 'object' ? raw : {});
  const rawSummary = source.summary || source.stats || source.metrics || {};
  const summary = {
    totalLeads: dashboardNumber(dashboardValue(rawSummary, ['totalLeads', 'total_leads'], dashboardValue(source, ['totalLeads', 'total_leads'], 0))),
    newLeads: dashboardNumber(dashboardValue(rawSummary, ['newLeads', 'new_leads'], dashboardValue(source, ['newLeads', 'new_leads'], 0))),
    hotLeads: dashboardNumber(dashboardValue(rawSummary, ['hotLeads', 'hot_leads'], dashboardValue(source, ['hotLeads', 'hot_leads'], 0))),
    followUpsDue: dashboardNumber(dashboardValue(rawSummary, ['followUpsDue', 'follow_ups_due', 'followUps', 'follow_ups'], dashboardValue(source, ['followUpsDue', 'follow_ups_due', 'followUps', 'follow_ups'], 0))),
    overdueFollowUps: dashboardNumber(dashboardValue(rawSummary, ['overdueFollowUps', 'overdue_follow_ups'], dashboardValue(source, ['overdueFollowUps', 'overdue_follow_ups'], 0))),
    activeCustomers: dashboardNumber(dashboardValue(rawSummary, ['activeCustomers', 'active_customers', 'customers'], dashboardValue(source, ['activeCustomers', 'active_customers', 'customers'], 0))),
    closedDeals: dashboardNumber(dashboardValue(rawSummary, ['closedDeals', 'closed_deals'], dashboardValue(source, ['closedDeals', 'closed_deals'], 0))),
    conversionRate: dashboardNumber(dashboardValue(rawSummary, ['conversionRate', 'conversion_rate'], dashboardValue(source, ['conversionRate', 'conversion_rate'], 0))),
    revenue: dashboardNumber(dashboardValue(rawSummary, ['revenue'], dashboardValue(source, ['revenue'], 0))),
    bookingVolume: dashboardSafeString(dashboardValue(rawSummary, ['bookingVolume', 'booking_volume'], dashboardValue(source, ['bookingVolume', 'booking_volume'], '')), ''),
    myLeads: dashboardNumber(dashboardValue(rawSummary, ['myLeads', 'my_leads'], 0)),
    myHotLeads: dashboardNumber(dashboardValue(rawSummary, ['myHotLeads', 'my_hot_leads'], 0)),
    myFollowUpsToday: dashboardNumber(dashboardValue(rawSummary, ['myFollowUpsToday', 'my_follow_ups_today'], 0)),
    myOverdueFollowUps: dashboardNumber(dashboardValue(rawSummary, ['myOverdueFollowUps', 'my_overdue_follow_ups'], 0)),
    myCustomers: dashboardNumber(dashboardValue(rawSummary, ['myCustomers', 'my_customers'], 0)),
    myClosedDeals: dashboardNumber(dashboardValue(rawSummary, ['myClosedDeals', 'my_closed_deals'], 0))
  };
  const leadInflow = dashboardSafeArray(source.leadInflow ?? source.lead_inflow).map((point, index) => {
    if (typeof point === 'number') return { label: dashboardMonths[index] || `M${index + 1}`, leads: dashboardNumber(point) };
    const item = point && typeof point === 'object' ? point : {};
    return { label: dashboardSafeString(dashboardValue(item, ['label', 'month', 'name'], dashboardMonths[index] || `M${index + 1}`)), leads: dashboardNumber(dashboardValue(item, ['leads', 'count', 'value'], 0)) };
  });
  const sourceTotal = dashboardNumber(summary.totalLeads, 0);
  const leadSources = dashboardSafeArray(source.leadSources ?? source.lead_sources).map(item => {
    const record = item && typeof item === 'object' ? item : {};
    const count = dashboardNumber(dashboardValue(record, ['count', 'value', 'leads'], 0));
    return { source: dashboardSafeString(dashboardValue(record, ['source', 'name', 'label'], null)), count, percentage: dashboardNumber(dashboardValue(record, ['percentage', 'percent'], sourceTotal ? dashboardPercent(count, sourceTotal) : 0)) };
  });
  const rawFollowUps = dashboardSafeArray(source.followUpPerformance ?? source.follow_up_performance);
  const followUpTotal = rawFollowUps.reduce((total, item) => total + dashboardNumber(dashboardValue(item, ['count', 'value'], 0)), 0);
  const followUpPerformance = dashboardStatuses.map(status => { const item = rawFollowUps.find(entry => dashboardSafeString(dashboardValue(entry, ['status', 'name', 'label'], ''), '').toLowerCase() === status.toLowerCase()); const count = dashboardNumber(dashboardValue(item, ['count', 'value'], 0)); return { status, count, percentage: dashboardPercent(count, followUpTotal) }; });
  const rawConversion = dashboardSafeArray(source.conversionOverview ?? source.conversion_overview);
  const conversionOverview = dashboardStages.map(stage => { const item = rawConversion.find(entry => dashboardSafeString(dashboardValue(entry, ['stage', 'name', 'label'], ''), '').toLowerCase().replace('new leads', 'new') === stage.toLowerCase()); const count = dashboardNumber(dashboardValue(item, ['count', 'value', 'leads'], 0)); return { stage, count, percentage: dashboardNumber(dashboardValue(item, ['percentage', 'percent'], dashboardPercent(count, dashboardNumber(summary.totalLeads)))) }; });
  const agentPerformance = dashboardSafeArray(source.agentPerformance ?? source.agent_performance ?? source.topAgents ?? source.top_agents ?? source.agents).map((item, index) => ({ agentId: dashboardSafeString(dashboardValue(item, ['agentId', 'agent_id', 'id'], null), `agent-${index + 1}`), agentName: dashboardAgentName(item), teamName: dashboardSafeString(dashboardValue(item, ['teamName', 'team_name', 'team'], null), 'Sales team'), assignedLeads: dashboardNumber(dashboardValue(item, ['assignedLeads', 'assigned_leads', 'assigned'], 0)), contactedLeads: dashboardNumber(dashboardValue(item, ['contactedLeads', 'contacted_leads', 'contacted'], 0)), completedFollowUps: dashboardNumber(dashboardValue(item, ['completedFollowUps', 'completed_follow_ups', 'completed'], 0)), overdueFollowUps: dashboardNumber(dashboardValue(item, ['overdueFollowUps', 'overdue_follow_ups', 'overdue'], 0)), closedDeals: dashboardNumber(dashboardValue(item, ['closedDeals', 'closed_deals', 'closed'], 0)), conversionRate: dashboardNumber(String(dashboardValue(item, ['conversionRate', 'conversion_rate', 'conversion'], 0)).replace('%', '')), presenceStatus: dashboardPresenceStatus(item), lastActivityAt: dashboardValue(item, ['lastActivityAt', 'last_activity_at', 'lastActivity', 'last_activity'], null) }));
  const recentLeads = dashboardSafeArray(source.recentLeads ?? source.recent_leads).map((item, index) => ({ id: dashboardSafeString(dashboardValue(item, ['id', 'legacy_id'], null), `recent-lead-${index + 1}`), leadName: dashboardLeadName(item), phone: dashboardSafeString(dashboardValue(item, ['phone', 'phone_number'], null), 'No phone'), source: dashboardSafeString(dashboardValue(item, ['source', 'lead_source', 'source_name'], null)), interestedIn: dashboardSafeString(dashboardValue(item, ['interestedIn', 'interested_in', 'interest'], null)), assignedAgentId: dashboardSafeString(dashboardValue(item, ['assignedAgentId', 'assigned_agent_id'], null), ''), assignedAgent: dashboardAgentName(item), status: dashboardRecordStatus(item), createdAt: dashboardRecordDate(item) }));
  const followUpRows = dashboardSafeArray(source.todayFollowUps ?? source.today_follow_ups ?? source.upcomingFollowUps ?? source.upcoming_follow_ups ?? source.followUps ?? source.follow_ups);
  const todayFollowUps = followUpRows.map((item, index) => ({ id: dashboardSafeString(dashboardValue(item, ['id', 'legacy_id'], null), `today-follow-up-${index + 1}`), customerId: dashboardValue(item, ['customerId', 'customer_id'], null), customerName: dashboardCustomerName(item), phone: dashboardSafeString(dashboardValue(item, ['phone', 'phone_number'], null), 'No phone'), followUpType: dashboardSafeString(dashboardValue(item, ['followUpType', 'follow_up_type', 'type'], null)), assignedAgent: dashboardAgentName(item), dueDate: dashboardSafeString(dashboardValue(item, ['dueDate', 'due_date'], null), 'No date'), dueTime: dashboardSafeString(dashboardValue(item, ['dueTime', 'due_time', 'time'], null), 'No time'), status: dashboardRecordStatus(item), priority: dashboardSafeString(dashboardValue(item, ['priority'], null), dashboardRecordStatus(item) === 'Overdue' ? 'High' : 'Medium') }));
  const recentActivities = dashboardSafeArray(source.recentActivities ?? source.recent_activities ?? source.activities).map((item, index) => ({ id: dashboardSafeString(dashboardValue(item, ['id', 'legacy_id'], null), `recent-activity-${index + 1}`), customerName: dashboardCustomerName(item), actorName: dashboardAgentName(item), description: dashboardSafeString(dashboardValue(item, ['description', 'activity', 'action'], null)), status: dashboardRecordStatus(item), createdAt: dashboardRecordDate(item) }));
  return { role: dashboardRole().role, scope: dashboardRole().scope, dateRange: state.dashboardDateRange, summary, leadInflow, leadSources, followUpPerformance, agentPerformance: state.role === 'SALES_AGENT' ? [] : agentPerformance, conversionOverview, recentLeads, recentActivities, todayFollowUps, scopeLabel: dashboardSafeString(source.scopeLabel ?? raw?.scopeLabel ?? dashboardRole().scopeLabel), meta: { generatedAt: dashboardSafeString(source.meta?.generatedAt ?? raw?.meta?.generatedAt, new Date().toISOString()), timezone: 'Asia/Karachi', currency: 'PKR' } };
}

async function dashboardEndpoint(path) { const query = new URLSearchParams({ role: dashboardRole().role, scope: dashboardRole().scope, dateRange: state.dashboardDateRange }); if (state.dashboardCustomStart) query.set('startDate', state.dashboardCustomStart); if (state.dashboardCustomEnd) query.set('endDate', state.dashboardCustomEnd); const result = await apiFetch(`${path}?${query.toString()}`); return result.data ?? result; }

async function sendPresenceHeartbeat() { try { await apiFetch('/api/presence/heartbeat', { method: 'POST' }); } catch (error) { /* presence is best effort */ } }
function ensurePresenceHeartbeat() {
  if (!state.authUser || dashboardPresenceTimer) return;
  sendPresenceHeartbeat();
  dashboardPresenceTimer = window.setInterval(async () => {
    if (!state.authUser) { window.clearInterval(dashboardPresenceTimer); dashboardPresenceTimer = null; return; }
    await sendPresenceHeartbeat();
    if (state.screen === 'dashboard' && ['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role)) loadDashboard({ force: true });
  }, 30 * 1000);
}

window.aureumEnsurePresenceHeartbeat = ensurePresenceHeartbeat;

async function loadDashboard(options = {}) {
  if (!state.authUser) return;
  ensurePresenceHeartbeat();
  const cacheKey = dashboardCacheKey();
  const forceRefresh = Boolean(options?.force);
  if (forceRefresh) dashboardSummaryCache.delete(cacheKey);
  const cachedData = forceRefresh ? null : dashboardReadCache(cacheKey);
  state.dashboard = { loading: true, error: '', data: cachedData || state.dashboard.data || null, cacheHit: Boolean(cachedData), backgroundRefreshing: Boolean(cachedData) };
  render();
  try {
    const endpoints = ['/api/dashboard/summary', '/api/dashboard/lead-inflow', '/api/dashboard/lead-sources', '/api/dashboard/follow-up-performance', '/api/dashboard/conversion-overview', '/api/dashboard/recent-leads', '/api/dashboard/today-follow-ups'];
    if (state.role !== 'SALES_AGENT') endpoints.push('/api/dashboard/agent-performance');
    const responses = await Promise.all(endpoints.map(dashboardEndpoint));
    const [summary, leadInflow, leadSources, followUpPerformance, conversionOverview, recentLeads, todayFollowUps, agentPerformance] = responses;
    const normalized = normalizeDashboardData({ summary: summary.summary || summary, scopeLabel: summary.scope || '', leadInflow, leadSources, followUpPerformance, conversionOverview, recentLeads, todayFollowUps, agentPerformance });
    dashboardWriteCache(normalized, cacheKey);
    state.dashboard = { loading: false, error: '', data: normalized, cacheHit: Boolean(cachedData), backgroundRefreshing: false };
  } catch (error) {
    state.dashboard = cachedData ? { loading: false, error: '', data: cachedData, cacheHit: true, backgroundRefreshing: false, backgroundError: error.message } : { loading: false, error: error.message, data: null };
  }
  render();
}

function useDashboardData(params = {}) { return { data: state.dashboard.data, isLoading: state.dashboard.loading, isError: Boolean(state.dashboard.error), error: state.dashboard.error ? new Error(state.dashboard.error) : undefined, refetch: loadDashboard, params }; }
function useDashboardSummary(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.summary }; }
function useLeadInflow(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.leadInflow || [] }; }
function useLeadSources(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.leadSources || [] }; }
function useFollowUpPerformance(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.followUpPerformance || [] }; }
function useAgentPerformance(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.agentPerformance || [] }; }
function useConversionOverview(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.conversionOverview || [] }; }
function useRecentLeads(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.recentLeads || [] }; }
function useTodayFollowUps(params = {}) { return { ...useDashboardData(params), data: state.dashboard.data?.todayFollowUps || [] }; }

function dashboardCard(title, subtitle, content, className = '', headingExtra = '') { return `<article class="card dashboard-chart-card ${className}"><div class="dashboard-card-heading"><div><h3>${title}</h3><p>${subtitle}</p></div>${headingExtra}</div>${content}</article>`; }

function dashboardChartMax(values) {
  const numericValues = dashboardSafeArray(values).map(Number).filter(Number.isFinite).map(value => Math.max(0, value));
  const rawMax = Math.max(...numericValues, 0);
  if (rawMax <= 0) return 1;
  if (rawMax <= 2) return 2;
  if (rawMax <= 5) return 5;
  if (rawMax <= 10) return 10;
  if (rawMax <= 25) return 25;
  if (rawMax <= 50) return 50;
  if (rawMax <= 60) return 60;
  return Math.ceil(rawMax / 10) * 10;
}

function dashboardChartLabel(value) {
  const label = dashboardSafeString(value, '');
  const dateMatch = label.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2}):\d{2})?)?$/);
  if (!dateMatch) return label;
  const [, year, month, day, hour] = dateMatch;
  const monthLabel = dashboardMonths[Number(month) - 1] || month;
  if (!day) return `${monthLabel} ${year}`;
  if (!hour) return `${monthLabel} ${Number(day)}`;
  const hourNumber = Number(hour);
  const meridiem = hourNumber >= 12 ? 'PM' : 'AM';
  const displayHour = hourNumber % 12 || 12;
  return `${monthLabel} ${Number(day)} ${displayHour}:00 ${meridiem}`;
}

function dashboardLineChart(points, totalLeads = state.dashboard.data?.summary?.totalLeads ?? null) {
  points = dashboardSafeArray(points);
  const colors = dashboardChartColors();
  let values = points.map(point => dashboardNumber(point.leads));
  const total = totalLeads === null || totalLeads === undefined ? values.reduce((sum, value) => sum + Math.max(0, value), 0) : Math.max(0, dashboardNumber(totalLeads));
  if (!points.length && total > 0) { points = [{ label: 'Selected range', leads: total }]; values = [total]; }
  if (!points.length || (!values.some(value => value > 0) && total <= 0)) return '<div class="dashboard-empty dashboard-line-empty" role="status">No leads were created in this date range.</div>';
  const chartValues = points.map(point => dashboardNumber(point.leads));
  const width = 700;
  const height = 280;
  const plot = { left: 54, right: 18, top: 18, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  // Keep a stable reference axis for small ranges so Today/This Week do not
  // turn into a misleading 1–2 scale. The plotted point remains visible, and
  // larger datasets still expand beyond the reference range when necessary.
  const chartMax = Math.max(dashboardChartMax(chartValues), 60);
  const tickValues = chartMax <= 60
    ? [0, 5, 10, 20, 30, 40, 50, 60]
    : Array.from({ length: Math.round(chartMax / 10) + 1 }, (_, index) => index * 10);
  const formatTick = value => Number.isInteger(value) ? dashboardFormatNumber(value) : value.toFixed(1);
  const xFor = index => plot.left + index * (plotWidth / Math.max(chartValues.length - 1, 1));
  const yFor = value => plot.top + plotHeight - ((value / chartMax) * plotHeight);
  const coords = chartValues.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
  const line = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${coords.at(-1)?.x || plot.left + plotWidth} ${plot.top + plotHeight} L ${coords[0]?.x || plot.left} ${plot.top + plotHeight} Z`;
  const grid = tickValues.map(value => { const y = yFor(value).toFixed(1); return `<line class="chart-gridline" x1="${plot.left}" x2="${plot.left + plotWidth}" y1="${y}" y2="${y}"/><text class="chart-axis-number" x="${plot.left - 10}" y="${Number(y) + 3.5}" text-anchor="end">${dashboardEscape(formatTick(value))}</text>`; }).join('');
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 6));
  const labelIndexes = points.map((_, index) => index).filter(index => index === 0 || index === points.length - 1 || index % labelStep === 0);
  const xLabels = labelIndexes.map(index => { const label = dashboardChartLabel(points[index]?.label || dashboardMonths[index] || `Point ${index + 1}`); return `<text class="chart-axis-label" x="${xFor(index)}" y="${height - 23}" text-anchor="middle">${dashboardEscape(label)}</text>`; }).join('');
  const pointCircles = coords.map((point, index) => { const label = dashboardChartLabel(points[index]?.label || dashboardMonths[index] || `Point ${index + 1}`); const value = dashboardCountLabel(chartValues[index], 'lead'); return `<circle cx="${point.x}" cy="${point.y}" r="4" style="stroke:${colors.gold}"><title>${dashboardEscape(dashboardTooltipText(label, [value]))}</title></circle>`; }).join('');
  const hotspots = coords.map((point, index) => { const label = dashboardChartLabel(points[index]?.label || dashboardMonths[index] || `Point ${index + 1}`); const value = dashboardCountLabel(chartValues[index], 'lead'); const text = dashboardTooltipText(label, [value]); const edgeClass = index === 0 ? ' is-first' : index === coords.length - 1 ? ' is-last' : ''; return `<span class="dashboard-line-hotspot dashboard-tooltip-anchor${edgeClass}" style="left:${((point.x / width) * 100).toFixed(2)}%;top:${((point.y / height) * 100).toFixed(2)}%" tabindex="0" aria-label="${dashboardEscape(text)}">${dashboardTooltip(label, [value])}</span>`; }).join('');
  return `<div class="dashboard-line-chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Lead inflow trend chart. Dates are shown horizontally and lead count is shown vertically."><defs><linearGradient id="lead-inflow-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${colors.gold}" stop-opacity=".34"/><stop offset="100%" stop-color="${colors.gold}" stop-opacity=".02"/></linearGradient></defs>${grid}<line class="chart-axis" x1="${plot.left}" x2="${plot.left}" y1="${plot.top}" y2="${plot.top + plotHeight}"/><line class="chart-axis" x1="${plot.left}" x2="${plot.left + plotWidth}" y1="${plot.top + plotHeight}" y2="${plot.top + plotHeight}"/><path class="chart-area" d="${area}"/><path class="chart-line" d="${line}" style="stroke:${colors.gold}"/>${pointCircles}${xLabels}<text class="chart-axis-title chart-axis-title-y" x="14" y="${plot.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${plot.top + plotHeight / 2})">Leads</text><text class="chart-axis-title" x="${plot.left + plotWidth / 2}" y="${height - 3}" text-anchor="middle">Date</text></svg><div class="dashboard-line-hotspots">${hotspots}</div></div>`;
}

function dashboardSourceChart(items) { items = dashboardSafeArray(items); const palette = dashboardChartColors(); const colors = [palette.gold, palette.softGold, palette.deepBrown, palette.success, palette.softBeige, palette.warning, palette.error]; const total = items.reduce((sum, item) => sum + dashboardNumber(item.percentage), 0) || 100; const visibleTotal = items.reduce((sum, item) => sum + dashboardNumber(item.count), 0); let offset = 0; const stops = items.map((item, index) => { const start = offset; offset += (dashboardNumber(item.percentage) / total) * 100; return `${colors[index % colors.length]} ${start}% ${offset}%`; }).join(', '); return `<div class="dashboard-source-layout"><div class="dashboard-donut dashboard-tooltip-anchor" style="background:conic-gradient(${stops})" tabindex="0" aria-label="${dashboardEscape(dashboardTooltipText('Visible leads', [`${dashboardFormatNumber(visibleTotal)} total`]))}"><div><strong>${dashboardEscape(dashboardFormatNumber(visibleTotal))}</strong><span>Visible leads</span></div>${dashboardTooltip('Visible leads', [`${dashboardFormatNumber(visibleTotal)} total`])}</div><div class="dashboard-source-list">${items.map((item, index) => { const percentage = dashboardNumber(item.percentage); const count = dashboardCountLabel(item.count, 'lead'); const text = dashboardTooltipText(item.source, [`${percentage}% of visible leads`, count]); return `<div class="dashboard-source-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><span><i style="background:${colors[index % colors.length]}"></i>${dashboardEscape(item.source)}</span><b>${percentage}%</b>${dashboardTooltip(item.source, [`${percentage}% of visible leads`, count])}</div>`; }).join('')}</div></div>`; }

function dashboardFollowUpChart(items) { items = dashboardSafeArray(items); const max = Math.max(...items.map(item => dashboardNumber(item.count)), 1); return `<div class="dashboard-performance-list">${items.map(item => { const status = dashboardSafeString(item?.status, 'Unknown'); const count = dashboardNumber(item?.count); const percentage = dashboardNumber(item?.percentage).toFixed(0); const countLabel = dashboardCountLabel(count, 'follow-up'); const text = dashboardTooltipText(status, [countLabel, `${percentage}% of activity`]); return `<div class="dashboard-performance-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><div><span>${dashboardEscape(status)}</span><small>${percentage}% of activity</small></div><div class="dashboard-performance-track"><i class="dashboard-${dashboardEscape(status.toLowerCase())}" style="width:${Math.max(3, dashboardPercent(count, max))}%"></i></div><b>${count}</b>${dashboardTooltip(status, [countLabel, `${percentage}% of activity`])}</div>`; }).join('')}</div>`; }

function dashboardAgentFilterOptions(items) { const records = dashboardSafeArray(items); const selected = dashboardSafeArray(state.dashboardAgentFilter); const allSelected = selected.includes('*') || !selected.length; const summary = allSelected ? `All users (${records.length})` : `${selected.length} selected`; return `<details class="dashboard-agent-filter"><summary>Show ${dashboardEscape(summary)} <span aria-hidden="true">⌄</span></summary><div class="dashboard-agent-filter-menu"><label><input type="checkbox" data-dashboard-agent-filter-all ${allSelected ? 'checked' : ''} /> All users</label>${records.map(item => { const id = dashboardSafeString(item.agentId, ''); const name = dashboardAgentName(item); return `<label><input type="checkbox" value="${dashboardEscape(id)}" data-dashboard-agent-filter-option ${selected.includes(id) ? 'checked' : ''} /> ${dashboardEscape(name)}</label>`; }).join('')}<div class="dashboard-agent-filter-actions"><button type="button" class="btn btn-gold btn-sm" data-dashboard-agent-filter-apply>Apply</button><button type="button" class="btn btn-secondary btn-sm" data-dashboard-agent-filter-clear>Clear</button></div></div></details>`; }
function dashboardRecentLeadAgentFilterOptions(items) { const records = dashboardSafeArray(items); const selected = dashboardSafeString(state.dashboardRecentLeadAgentId, ''); return `<label class="dashboard-recent-agent-filter-label"><span>Assigned Agent</span><select class="select dashboard-recent-agent-filter" data-dashboard-recent-agent-filter aria-label="Filter recent leads by assigned agent"><option value="">All agents</option>${records.map(item => { const id = dashboardSafeString(item.agentId, ''); return `<option value="${dashboardEscape(id)}" ${selected === id ? 'selected' : ''}>${dashboardEscape(dashboardAgentName(item))}</option>`; }).join('')}</select></label>`; }
function dashboardAgentChart(items) { items = dashboardSafeArray(items); if (!items.length) return '<div class="dashboard-empty">No users match this filter.</div>'; return `<div class="dashboard-agent-list">${items.map(item => { const agentName = dashboardAgentName(item); const agentId = dashboardSafeString(item.agentId, ''); const conversion = dashboardNumber(item.conversionRate).toFixed(1); const presence = dashboardPresenceStatus(item); const presenceLabel = presence === 'online' ? 'Online' : presence === 'away' ? 'Away' : 'Offline'; const lines = [`${presenceLabel}`, `${conversion}% conversion`, dashboardCountLabel(item.assignedLeads, 'assigned lead'), dashboardCountLabel(item.closedDeals, 'closed deal'), dashboardCountLabel(item.overdueFollowUps, 'overdue follow-up')]; const text = dashboardTooltipText(agentName, lines); return `<div class="dashboard-agent-row dashboard-tooltip-anchor" data-dashboard-agent-open="${dashboardEscape(agentId)}" role="button" tabindex="0" aria-label="Open ${dashboardEscape(agentName)} profile. ${dashboardEscape(text)}"><div class="dashboard-agent-avatar">${dashboardEscape(dashboardInitials(agentName))}</div><div class="dashboard-agent-main"><strong>${dashboardEscape(agentName)}</strong><span>${dashboardEscape(dashboardSafeString(item.teamName, 'Sales team'))} · ${dashboardCountLabel(item.assignedLeads, 'assigned lead')} · <span class="dashboard-agent-presence"><i class="presence-dot ${presence}"></i>${dashboardEscape(presenceLabel)}</span></span><div class="dashboard-agent-track"><i style="width:${Math.min(100, dashboardNumber(item.conversionRate) * 4)}%"></i></div></div>${dashboardTooltip(agentName, lines)}</div>`; }).join('')}</div>`; }

function dashboardConversionChart(items) { items = dashboardSafeArray(items); const max = Math.max(...items.map(item => dashboardNumber(item.count)), 1); return `<div class="dashboard-conversion-list">${items.map(item => { const stage = dashboardSafeString(item?.stage, 'Unknown'); const count = dashboardNumber(item?.count); const percentage = dashboardNumber(item?.percentage).toFixed(0); const countLabel = dashboardCountLabel(count, 'lead'); const text = dashboardTooltipText(stage, [countLabel, `${percentage}% of total pipeline`]); return `<div class="dashboard-conversion-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><span>${dashboardEscape(stage)}</span><div><i style="width:${Math.max(2, dashboardPercent(count, max))}%"></i></div><b>${dashboardFormatNumber(count)}</b>${dashboardTooltip(stage, [countLabel, `${percentage}% of total pipeline`])}</div>`; }).join('')}</div>`; }

function dashboardRecentLeads(items) { items = dashboardSafeArray(items); if (!items.length) return '<div class="dashboard-empty">No recent leads found.</div>'; return `<div class="table-wrap dashboard-table-wrap"><table class="dashboard-data-table"><thead><tr><th>Lead Name</th><th>Source</th><th>Interested In</th><th>Assigned Agent</th><th>Status</th><th>Created Date</th></tr></thead><tbody>${items.slice(0, 6).map(item => { const leadName = dashboardLeadName(item); const status = dashboardRecordStatus(item); const leadId = dashboardSafeString(dashboardValue(item, ['id', 'leadId', 'lead_id'], ''), ''); return `<tr><td><button class="profile-link-button" data-lead-open="${dashboardEscape(leadId)}" aria-label="Open ${dashboardEscape(leadName)} lead profile">${person(dashboardEscape(leadName), dashboardEscape(dashboardInitials(leadName)), dashboardEscape(dashboardSafeString(item?.phone, 'No phone')))}</button></td><td>${dashboardEscape(dashboardSafeString(item?.source))}</td><td>${dashboardEscape(dashboardSafeString(item?.interestedIn))}</td><td>${dashboardEscape(dashboardAgentName(item))}</td><td>${badge(status)}</td><td>${dashboardEscape(dashboardSafeString(item?.createdAt, 'No date'))}</td></tr>`; }).join('')}</tbody></table></div>`; }

function dashboardTodayFollowUps(items) { items = dashboardSafeArray(items); if (!items.length) { const range = dashboardDateRangeLabel(); return `<div class="dashboard-empty">${range === 'Today' ? 'No follow-ups due today.' : `No follow-ups found for ${range.toLowerCase()}.`}</div>`; } return `<div class="dashboard-followup-list">${items.slice(0, 6).map(item => { const status = dashboardRecordStatus(item); return `<div class="dashboard-followup-row ${status === 'Overdue' ? 'is-overdue' : ''}"><div class="dashboard-followup-time">${dashboardEscape(dashboardSafeString(item?.dueTime, 'No time'))}</div><div class="dashboard-followup-main"><strong>${dashboardEscape(dashboardCustomerName(item))}</strong><span>${dashboardEscape(dashboardSafeString(item?.followUpType))} · ${dashboardEscape(dashboardAgentName(item))}</span></div><div>${badge(status)}</div></div>`; }).join('')}</div>`; }

function dashboardQuickActions(actions) { return `<div class="dashboard-quick-actions">${actions.map(([screen, label], index) => `<button class="btn ${index === 0 ? 'btn-gold' : 'btn-secondary'}" data-screen="${screen}">${dashboardEscape(label)} ${icons.arrow}</button>`).join('')}</div>`; }

function dashboardNavigateFromKpi(element) {
  const screen = element.dataset.dashboardKpiScreen; const filter = element.dataset.dashboardKpiFilter || '';
  if (screen === 'leads' || screen === 'my-leads') state.leadFilters = { ...(state.leadFilters || {}), status: filter === 'today' || filter === 'overdue' ? '' : filter };
  if (screen === 'follow-ups') { state.followupDateFilter = filter || 'all'; state.followupTab = 'all'; }
  navigate(screen);
  const queryKey = screen === 'follow-ups' ? 'filter' : filter ? 'status' : '';
  if (queryKey) window.history.replaceState({}, '', `${routePaths[screen]}?${queryKey}=${encodeURIComponent(filter)}`);
}

function bindDashboardModuleEvents() {
  if (window.aureumDashboardEventsBound) return;
  window.aureumDashboardEventsBound = true;
  document.addEventListener('click', event => {
    const agent = event.target.closest?.('[data-dashboard-agent-open]');
    if (agent) { window.aureumOpenReportAgent?.(agent.dataset.dashboardAgentOpen); return; }
    const kpi = event.target.closest?.('[data-dashboard-kpi]');
    if (kpi) { dashboardNavigateFromKpi(kpi); return; }
    const apply = event.target.closest?.('[data-dashboard-apply-range]');
    if (apply) { state.dashboardCustomStart = document.querySelector('[data-dashboard-start]')?.value || ''; state.dashboardCustomEnd = document.querySelector('[data-dashboard-end]')?.value || ''; loadDashboard(); return; }
    const clear = event.target.closest?.('[data-dashboard-clear-range]');
    if (clear) { state.dashboardDateRange = 'this_month'; state.dashboardCustomStart = ''; state.dashboardCustomEnd = ''; loadDashboard(); }
    const applyAgentFilter = event.target.closest?.('[data-dashboard-agent-filter-apply]');
    if (applyAgentFilter) { const all = document.querySelector('[data-dashboard-agent-filter-all]'); state.dashboardAgentFilter = all?.checked ? ['*'] : [...document.querySelectorAll('[data-dashboard-agent-filter-option]:checked')].map(input => input.value).filter(Boolean); render(); return; }
    const clearAgentFilter = event.target.closest?.('[data-dashboard-agent-filter-clear]');
    if (clearAgentFilter) { state.dashboardAgentFilter = []; render(); return; }
  });
  document.addEventListener('change', event => { if (event.target.matches?.('[data-dashboard-date-range]')) { state.dashboardDateRange = event.target.value; if (state.dashboardDateRange === 'custom') render(); else loadDashboard(); } if (event.target.matches?.('[data-dashboard-recent-agent-filter]')) { state.dashboardRecentLeadAgentId = event.target.value || ''; loadDashboard({ force: true }); } if (event.target.matches?.('[data-dashboard-agent-filter-all]') && event.target.checked) document.querySelectorAll('[data-dashboard-agent-filter-option]').forEach(input => { input.checked = false; }); if (event.target.matches?.('[data-dashboard-agent-filter-option]') && event.target.checked) { const all = document.querySelector('[data-dashboard-agent-filter-all]'); if (all) all.checked = false; } });
  document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('[data-dashboard-kpi]')) { event.preventDefault(); dashboardNavigateFromKpi(event.target); } });
}

function renderDashboard() {
  const role = dashboardRole(); const data = state.dashboard.data ? normalizeDashboardData(state.dashboard.data) : null;
  if (state.dashboard.loading && !data) return '<section class="dashboard-loading-grid"><div class="dashboard-skeleton dashboard-skeleton-banner"></div><div class="dashboard-skeleton dashboard-skeleton-kpis"></div><div class="dashboard-skeleton dashboard-skeleton-charts"></div></section>';
  if (state.dashboard.error && !data) return `<section class="dashboard-error card"><div class="dashboard-error-mark">!</div><h2>Unable to load dashboard data</h2><p>${dashboardEscape(state.dashboard.error)} Please try again.</p><button class="btn btn-gold" data-reload-dashboard>Try again</button></section>`;
  const baseData = data || normalizeDashboardData({}); const dashboardData = dashboardFilteredRecords(baseData); const isAgent = state.role === 'SALES_AGENT'; const actions = dashboardQuickActions(role.quickActions); const refresh = '<button class="btn btn-secondary btn-sm" data-reload-dashboard>Refresh dashboard</button>'; const allAgentPerformance = dashboardSafeArray(dashboardData.agentPerformance); const availableAgentIds = new Set(allAgentPerformance.map(item => dashboardSafeString(item.agentId, ''))); if (state.dashboardRecentLeadAgentId && !availableAgentIds.has(state.dashboardRecentLeadAgentId)) state.dashboardRecentLeadAgentId = ''; const selectedAgents = dashboardSafeArray(state.dashboardAgentFilter).filter(id => id === '*' || availableAgentIds.has(id)); if (selectedAgents.length !== dashboardSafeArray(state.dashboardAgentFilter).length) state.dashboardAgentFilter = selectedAgents; const agentPerformance = selectedAgents.includes('*') || !selectedAgents.length ? allAgentPerformance : allAgentPerformance.filter(item => selectedAgents.includes(dashboardSafeString(item.agentId, '')));
  return `<section class="dashboard-welcome"><div><div class="eyebrow">✦ The Perfect Blend of Serenity and Luxury</div><h2>Welcome back, ${dashboardEscape(dashboardWelcomeName(role))}</h2></div><div class="dashboard-welcome-side"><div class="dashboard-welcome-actions">${refresh}${dashboardDateFilter()}</div><div class="dashboard-welcome-mark">A</div></div></section><section class="dashboard-kpi-grid">${dashboardSummaryKpis(dashboardData.summary, state.role)}</section><section class="dashboard-chart-grid">${dashboardCard('Lead Inflow Trend', `${dashboardDateRangeLabel()} inquiry velocity across the permitted scope`, dashboardLineChart(dashboardData.leadInflow), 'dashboard-chart-wide')}${dashboardCard('Lead Sources', 'Acquisition channels distribution', dashboardSourceChart(dashboardData.leadSources))}</section><section class="dashboard-chart-grid">${dashboardCard('Follow-up Performance', 'Scheduled advisor client resolution', dashboardFollowUpChart(dashboardData.followUpPerformance))}${!isAgent ? dashboardCard('Agent Performance', 'Live CRM presence and conversion across permitted advisors', dashboardAgentChart(agentPerformance), '', dashboardAgentFilterOptions(allAgentPerformance)) : dashboardCard('Conversion Overview', 'Funnel progression from inquiry to booking', dashboardConversionChart(dashboardData.conversionOverview))}</section>${!isAgent ? `<section class="dashboard-chart-grid">${dashboardCard('Conversion Overview', 'Funnel progression from inquiry to booking', dashboardConversionChart(dashboardData.conversionOverview))}<div class="card dashboard-actions-card"><div class="dashboard-card-heading"><div><h3>Quick Actions</h3><p>Move from insight to the next best action.</p></div></div>${actions}</div></section>` : `<section class="card dashboard-actions-card" style="margin-top:18px"><div class="dashboard-card-heading"><div><h3>Quick Actions</h3><p>Keep today’s assigned relationships moving.</p></div></div>${actions}</section>`}<section class="dashboard-content-grid"><div class="card dashboard-table-card"><div class="dashboard-card-heading"><div><h3>Recent Leads</h3><p>Latest permitted investor inquiries.</p></div><div class="dashboard-card-heading-actions">${!isAgent ? dashboardRecentLeadAgentFilterOptions(allAgentPerformance) : ''}<button class="section-link" data-screen="${isAgent ? 'my-leads' : 'leads'}">View all ${icons.arrow}</button></div></div>${dashboardRecentLeads(dashboardData.recentLeads)}</div><div class="card dashboard-followup-card"><div class="dashboard-card-heading"><div><h3>${dashboardDateRangeLabel()} Follow-ups</h3><p>${isAgent ? 'Your scheduled client touchpoints.' : 'Scheduled team touchpoints.'}</p></div><select class="select dashboard-followup-range-select" data-dashboard-date-range aria-label="Follow-up period"><option value="today" ${state.dashboardDateRange === 'today' ? 'selected' : ''}>Today</option><option value="this_week" ${state.dashboardDateRange === 'this_week' ? 'selected' : ''}>This Week</option><option value="this_month" ${state.dashboardDateRange === 'this_month' ? 'selected' : ''}>This Month</option><option value="last_month" ${state.dashboardDateRange === 'last_month' ? 'selected' : ''}>Last Month</option><option value="custom" ${state.dashboardDateRange === 'custom' ? 'selected' : ''}>Custom Range</option></select></div>${dashboardTodayFollowUps(dashboardData.todayFollowUps)}</div></section>`;
}

bindDashboardModuleEvents();
window.invalidateDashboardCache = invalidateDashboardCache;
window.dashboardContracts = { dashboardRoleConfig, DASHBOARD_CACHE_TTL_MS, dashboardSafeString, dashboardSafeArray, dashboardLeadName, dashboardCustomerName, dashboardAgentName, dashboardInitials, dashboardWelcomeName, dashboardChartMax, dashboardChartLabel, dashboardLineChart, dashboardCacheKey, dashboardReadCache, dashboardWriteCache, invalidateDashboardCache, normalizeDashboardData, useDashboardData, useDashboardSummary, useLeadInflow, useLeadSources, useFollowUpPerformance, useAgentPerformance, useConversionOverview, useRecentLeads, useTodayFollowUps };
