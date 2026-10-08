// Dashboard module: role-aware data contracts, API hooks, and presentation.
// The project is intentionally buildless, so charts use semantic SVG/CSS primitives
// instead of a runtime chart dependency while keeping the same API-ready boundaries.

const dashboardMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dashboardStatuses = ['Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled'];
const dashboardStages = ['New', 'Contacted', 'Qualified', 'Follow-up', 'Negotiation', 'Booking', 'Closed Won'];

const dashboardRoleConfig = {
  SUPER_ADMIN: { role: 'super_admin', scope: 'company', welcome: 'Welcome back, Super Admin', welcomeCopy: 'Track company-wide leads, follow-ups, agents, and sales performance.', quickActions: [['leads', 'View All Leads'], ['reports', 'View Reports'], ['agents', 'Manage Agents'], ['follow-ups', 'View Follow-ups']] },
  SALES_MANAGER: { role: 'sales_manager', scope: 'team', welcome: 'Welcome back, Sales Manager', welcomeCopy: 'Monitor team leads, follow-ups, agents, and sales progress.', quickActions: [['add-lead', 'Add New Lead'], ['leads', 'View All Leads'], ['follow-ups', 'View Follow-ups'], ['reports', 'View Reports'], ['agents', 'View Agents']] },
  SALES_AGENT: { role: 'sales_agent', scope: 'own', welcome: 'Welcome back, Sales Agent', welcomeCopy: 'Manage your assigned leads, customers, and follow-ups for today.', quickActions: [['my-leads', 'View My Leads'], ['follow-ups', 'View Follow-ups'], ['customers', 'Open Customers'], ['team-chat', 'Team Chat']] }
};

const dashboardMock = {
  leadInflow: dashboardMonths.map((label, index) => ({ label, leads: [58, 72, 45, 66, 80, 55, 65, 75, 84, 100, 72, 88][index] })),
  leadSources: [{ source: 'Website', count: 437, percentage: 35 }, { source: 'WhatsApp', count: 349, percentage: 28 }, { source: 'Facebook', count: 225, percentage: 18 }, { source: 'Sales Partner', count: 150, percentage: 12 }, { source: 'Walk-in', count: 87, percentage: 7 }],
  followUpPerformance: [{ status: 'Completed', count: 184 }, { status: 'Pending', count: 56 }, { status: 'Overdue', count: 14 }, { status: 'Missed', count: 0 }, { status: 'Rescheduled', count: 28 }],
  conversionOverview: [{ stage: 'New', count: 1248, percentage: 100 }, { stage: 'Contacted', count: 892, percentage: 71 }, { stage: 'Qualified', count: 540, percentage: 43 }, { stage: 'Follow-up', count: 320, percentage: 26 }, { stage: 'Negotiation', count: 146, percentage: 12 }, { stage: 'Booking', count: 96, percentage: 8 }, { stage: 'Closed Won', count: 48, percentage: 4 }]
};

function dashboardRole() { return dashboardRoleConfig[state.role] || dashboardRoleConfig.SALES_AGENT; }
function dashboardEscape(value) { return window.AureumUI?.escape ? AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function dashboardNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function dashboardPercent(value, total) { return dashboardNumber(value, total ? (value / total) * 100 : 0); }

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
  return cards.map(([id, title, value, subtitle, variant], index) => `<article class="dashboard-stat-card dashboard-stat-${variant}" data-kpi-id="${id}"><div class="dashboard-stat-icon">${['◈', '✦', '◷', '!', '♢', '✓', '◆', '%'][index % 8]}</div><div><div class="dashboard-stat-title">${title}</div><div class="dashboard-stat-value">${dashboardEscape(value ?? '—')}</div><div class="dashboard-stat-subtitle">${dashboardEscape(subtitle)}</div></div></article>`).join('');
}

function normalizeDashboardData(raw = {}) {
  const summary = raw.summary || {};
  const leadInflow = Array.isArray(raw.leadInflow) ? raw.leadInflow.map((point, index) => typeof point === 'number' ? { label: dashboardMonths[index] || `M${index + 1}`, leads: point } : { label: point.label || dashboardMonths[index], leads: dashboardNumber(point.leads), ...point }) : dashboardMock.leadInflow;
  const sourceTotal = dashboardNumber(summary.totalLeads, 0);
  const leadSources = (raw.leadSources || dashboardMock.leadSources).map(item => ({ source: item.source || item.name, count: dashboardNumber(item.count, sourceTotal ? Math.round(sourceTotal * dashboardNumber(item.percentage ?? item.value) / 100) : 0), percentage: dashboardNumber(item.percentage ?? item.value) }));
  const followUpTotal = (raw.followUpPerformance || []).reduce((total, item) => total + dashboardNumber(item.count ?? item.value), 0);
  const followUpPerformance = dashboardStatuses.map(status => { const item = (raw.followUpPerformance || []).find(entry => (entry.status || entry.name) === status); const count = dashboardNumber(item?.count ?? item?.value); return { status, count, percentage: dashboardPercent(count, followUpTotal) }; });
  const conversionOverview = dashboardStages.map(stage => { const item = (raw.conversionOverview || []).find(entry => String(entry.stage || entry.name).toLowerCase().replace('new leads', 'new').replace('closed won', 'closed won') === stage.toLowerCase()); const count = dashboardNumber(item?.count ?? item?.value); return { stage, count, percentage: dashboardNumber(item?.percentage, dashboardPercent(count, dashboardNumber(summary.totalLeads))) }; });
  const agentPerformance = (raw.agentPerformance || []).filter(Boolean).map(item => ({ agentId: item.agentId || item.id || item.name, agentName: item.agentName || item.name, teamName: item.teamName || item.team, assignedLeads: dashboardNumber(item.assignedLeads ?? item.assigned), contactedLeads: dashboardNumber(item.contactedLeads ?? item.contacted), completedFollowUps: dashboardNumber(item.completedFollowUps ?? item.completed), overdueFollowUps: dashboardNumber(item.overdueFollowUps ?? item.overdue), closedDeals: dashboardNumber(item.closedDeals ?? item.closed), conversionRate: dashboardNumber(String(item.conversionRate ?? item.conversion).replace('%', '')) }));
  const recentLeads = (raw.recentLeads || []).map((item, index) => ({ id: item.id || `recent-lead-${index + 1}`, leadName: item.leadName || item.name, phone: item.phone, source: item.source || 'Manual Entry', interestedIn: item.interestedIn || item.interest, assignedAgent: item.assignedAgent || item.agent, status: item.status, createdAt: item.createdAt || item.created }));
  const todayFollowUps = (raw.todayFollowUps || []).map((item, index) => ({ id: item.id || `today-follow-up-${index + 1}`, customerId: item.customerId || item.customer_id, customerName: item.customerName || item.customer, phone: item.phone, followUpType: item.followUpType || item.type, assignedAgent: item.assignedAgent || item.agent, dueTime: item.dueTime || item.time, status: item.status, priority: item.priority || (item.status === 'Overdue' ? 'High' : 'Medium') }));
  return { role: dashboardRole().role, scope: dashboardRole().scope, dateRange: 'this_month', summary, leadInflow, leadSources, followUpPerformance, agentPerformance: state.role === 'SALES_AGENT' ? [] : agentPerformance, conversionOverview, recentLeads, todayFollowUps, scopeLabel: raw.scopeLabel || `${dashboardRole().scope} scope`, meta: { generatedAt: new Date().toISOString(), timezone: 'Asia/Karachi', currency: 'PKR' } };
}

async function dashboardEndpoint(path) { const result = await apiFetch(path); return result.data ?? result; }

async function loadDashboard() {
  if (!state.authUser) return;
  state.dashboard = { loading: true, error: '', data: state.dashboard.data || null };
  render();
  try {
    const endpoints = ['/api/dashboard/summary', '/api/dashboard/lead-inflow', '/api/dashboard/lead-sources', '/api/dashboard/follow-up-performance', '/api/dashboard/conversion-overview', '/api/dashboard/recent-leads', '/api/dashboard/today-follow-ups'];
    if (state.role !== 'SALES_AGENT') endpoints.push('/api/dashboard/agent-performance');
    const responses = await Promise.all(endpoints.map(dashboardEndpoint));
    const [summary, leadInflow, leadSources, followUpPerformance, conversionOverview, recentLeads, todayFollowUps, agentPerformance] = responses;
    state.dashboard = { loading: false, error: '', data: normalizeDashboardData({ summary: summary.summary || summary, scopeLabel: summary.scope || '', leadInflow, leadSources, followUpPerformance, conversionOverview, recentLeads, todayFollowUps, agentPerformance }) };
  } catch (error) {
    state.dashboard = { loading: false, error: error.message, data: null };
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

function dashboardCard(title, subtitle, content, className = '') { return `<article class="card dashboard-chart-card ${className}"><div class="dashboard-card-heading"><div><h3>${title}</h3><p>${subtitle}</p></div></div>${content}</article>`; }

function dashboardLineChart(points) {
  const values = points.map(point => dashboardNumber(point.leads)); const max = Math.max(...values, 1); const width = 620; const height = 210; const padding = 22; const coords = values.map((value, index) => ({ x: padding + index * ((width - padding * 2) / Math.max(values.length - 1, 1)), y: height - padding - ((value / max) * (height - padding * 2)) })); const line = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '); const area = `${line} L ${coords.at(-1)?.x || width - padding} ${height - padding} L ${coords[0]?.x || padding} ${height - padding} Z`; return `<div class="dashboard-line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Lead inflow trend line chart"><defs><linearGradient id="lead-inflow-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#C6A15B" stop-opacity=".34"/><stop offset="100%" stop-color="#C6A15B" stop-opacity=".02"/></linearGradient></defs><path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${coords.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5"/>`).join('')}</svg><div class="dashboard-chart-labels">${points.map(point => `<span>${dashboardEscape(point.label)}</span>`).join('')}</div></div>`;
}

function dashboardSourceChart(items) { const colors = ['#C6A15B', '#E2C67A', '#7D6444', '#2F6B4F', '#B7A68C', '#C88A2D', '#B94A48']; const total = items.reduce((sum, item) => sum + dashboardNumber(item.percentage), 0) || 100; let offset = 0; const stops = items.map((item, index) => { const start = offset; offset += (dashboardNumber(item.percentage) / total) * 100; return `${colors[index % colors.length]} ${start}% ${offset}%`; }).join(', '); return `<div class="dashboard-source-layout"><div class="dashboard-donut" style="background:conic-gradient(${stops})"><div><strong>${dashboardEscape(items.reduce((sum, item) => sum + item.count, 0).toLocaleString())}</strong><span>Visible leads</span></div></div><div class="dashboard-source-list">${items.map((item, index) => `<div class="dashboard-source-row"><span><i style="background:${colors[index % colors.length]}"></i>${dashboardEscape(item.source)}</span><b>${dashboardNumber(item.percentage)}%</b></div>`).join('')}</div></div>`; }

function dashboardFollowUpChart(items) { const max = Math.max(...items.map(item => dashboardNumber(item.count)), 1); return `<div class="dashboard-performance-list">${items.map(item => `<div class="dashboard-performance-row"><div><span>${dashboardEscape(item.status)}</span><small>${dashboardNumber(item.percentage).toFixed(0)}% of activity</small></div><div class="dashboard-performance-track"><i class="dashboard-${item.status.toLowerCase()}" style="width:${Math.max(3, dashboardPercent(item.count, max))}%"></i></div><b>${dashboardNumber(item.count)}</b></div>`).join('')}</div>`; }

function dashboardAgentChart(items) { if (!items.length) return '<div class="dashboard-empty">Agent performance is not available for this role.</div>'; return `<div class="dashboard-agent-list">${items.slice(0, 5).map(item => `<div class="dashboard-agent-row"><div class="dashboard-agent-avatar">${dashboardEscape(item.agentName.split(' ').map(part => part[0]).join('').slice(0, 2))}</div><div class="dashboard-agent-main"><strong>${dashboardEscape(item.agentName)}</strong><span>${dashboardEscape(item.teamName || 'Sales team')} · ${item.assignedLeads} assigned leads</span><div class="dashboard-agent-track"><i style="width:${Math.min(100, item.conversionRate * 4)}%"></i></div></div><b>${item.conversionRate.toFixed(1)}%</b></div>`).join('')}</div>`; }

function dashboardConversionChart(items) { const max = Math.max(...items.map(item => dashboardNumber(item.count)), 1); return `<div class="dashboard-conversion-list">${items.map(item => `<div class="dashboard-conversion-row"><span>${dashboardEscape(item.stage)}</span><div><i style="width:${Math.max(2, dashboardPercent(item.count, max))}%"></i></div><b>${dashboardNumber(item.count).toLocaleString()}</b></div>`).join('')}</div>`; }

function dashboardRecentLeads(items) { if (!items.length) return '<div class="dashboard-empty">No recent leads found.</div>'; return `<div class="table-wrap dashboard-table-wrap"><table class="dashboard-data-table"><thead><tr><th>Lead Name</th><th>Source</th><th>Interested In</th><th>Assigned Agent</th><th>Status</th><th>Created Date</th></tr></thead><tbody>${items.slice(0, 6).map(item => `<tr><td>${person(dashboardEscape(item.leadName), dashboardEscape(item.leadName.split(' ').map(part => part[0]).join('').slice(0, 2)), dashboardEscape(item.phone || ''))}</td><td>${dashboardEscape(item.source)}</td><td>${dashboardEscape(item.interestedIn)}</td><td>${dashboardEscape(item.assignedAgent || 'Unassigned')}</td><td>${badge(item.status)}</td><td>${dashboardEscape(item.createdAt)}</td></tr>`).join('')}</tbody></table></div>`; }

function dashboardTodayFollowUps(items) { if (!items.length) return '<div class="dashboard-empty">No follow-ups due today.</div>'; return `<div class="dashboard-followup-list">${items.slice(0, 6).map(item => `<div class="dashboard-followup-row ${item.status === 'Overdue' ? 'is-overdue' : ''}"><div class="dashboard-followup-time">${dashboardEscape(item.dueTime)}</div><div class="dashboard-followup-main"><strong>${dashboardEscape(item.customerName)}</strong><span>${dashboardEscape(item.followUpType)} · ${dashboardEscape(item.assignedAgent || 'Unassigned')}</span></div><div>${badge(item.status)}</div></div>`).join('')}</div>`; }

function dashboardQuickActions(actions) { return `<div class="dashboard-quick-actions">${actions.map(([screen, label], index) => `<button class="btn ${index === 0 ? 'btn-gold' : 'btn-secondary'}" data-screen="${screen}">${dashboardEscape(label)} ${icons.arrow}</button>`).join('')}</div>`; }

function renderDashboard() {
  const role = dashboardRole(); const data = state.dashboard.data ? normalizeDashboardData(state.dashboard.data) : null;
  if (state.dashboard.loading && !data) return pageHeader('Aureum Sales CRM', 'Dashboard', 'Track Aureum leads, customers, follow-ups, and sales performance from one place.') + '<section class="dashboard-loading-grid"><div class="dashboard-skeleton dashboard-skeleton-banner"></div><div class="dashboard-skeleton dashboard-skeleton-kpis"></div><div class="dashboard-skeleton dashboard-skeleton-charts"></div></section>';
  if (state.dashboard.error && !data) return pageHeader('Aureum Sales CRM', 'Dashboard', 'Track Aureum leads, customers, follow-ups, and sales performance from one place.', '<button class="btn btn-gold" data-reload-dashboard>Try again</button>') + `<section class="dashboard-error card"><div class="dashboard-error-mark">!</div><h2>Unable to load dashboard data</h2><p>${dashboardEscape(state.dashboard.error)} Please try again.</p></section>`;
  const dashboardData = data || normalizeDashboardData({}); const isAgent = state.role === 'SALES_AGENT'; const actions = dashboardQuickActions(role.quickActions); const refresh = '<button class="btn btn-secondary btn-sm" data-reload-dashboard>Refresh dashboard</button>';
  return pageHeader('Aureum Sales CRM', 'Dashboard', 'Track Aureum leads, customers, follow-ups, and sales performance from one place.', refresh) + `<section class="dashboard-welcome"><div><div class="eyebrow">✦ The Perfect Blend of Serenity and Luxury</div><h2>${role.welcome}</h2><p>${role.welcomeCopy}</p><span class="dashboard-scope">${dashboardEscape(dashboardData.scopeLabel)} · Live ${dashboardEscape(dashboardData.meta.timezone)} data</span></div><div class="dashboard-welcome-mark">A</div></section><section class="dashboard-kpi-grid">${dashboardSummaryKpis(dashboardData.summary, state.role)}</section><section class="dashboard-chart-grid">${dashboardCard('Lead Inflow Trend', 'Monthly inquiry velocity across the permitted scope', dashboardLineChart(dashboardData.leadInflow), 'dashboard-chart-wide')}${dashboardCard('Lead Sources', 'Acquisition channels distribution', dashboardSourceChart(dashboardData.leadSources))}</section><section class="dashboard-chart-grid">${dashboardCard('Follow-up Performance', 'Scheduled advisor client resolution', dashboardFollowUpChart(dashboardData.followUpPerformance))}${!isAgent ? dashboardCard('Agent Performance', 'Conversion benchmark across permitted advisors', dashboardAgentChart(dashboardData.agentPerformance)) : dashboardCard('Conversion Overview', 'Funnel progression from inquiry to booking', dashboardConversionChart(dashboardData.conversionOverview))}</section>${!isAgent ? `<section class="dashboard-chart-grid">${dashboardCard('Conversion Overview', 'Funnel progression from inquiry to booking', dashboardConversionChart(dashboardData.conversionOverview))}<div class="card dashboard-actions-card"><div class="dashboard-card-heading"><div><h3>Quick Actions</h3><p>Move from insight to the next best action.</p></div></div>${actions}</div></section>` : `<section class="card dashboard-actions-card" style="margin-top:18px"><div class="dashboard-card-heading"><div><h3>Quick Actions</h3><p>Keep today’s assigned relationships moving.</p></div></div>${actions}</section>`}<section class="dashboard-content-grid"><div class="card dashboard-table-card"><div class="dashboard-card-heading"><div><h3>Recent Leads</h3><p>Latest permitted investor inquiries.</p></div><button class="section-link" data-screen="${isAgent ? 'my-leads' : 'leads'}">View all ${icons.arrow}</button></div>${dashboardRecentLeads(dashboardData.recentLeads)}</div><div class="card dashboard-followup-card"><div class="dashboard-card-heading"><div><h3>Today’s Follow-ups</h3><p>${isAgent ? 'Your scheduled client touchpoints.' : 'Scheduled team touchpoints.'}</p></div><button class="section-link" data-screen="follow-ups">View all ${icons.arrow}</button></div>${dashboardTodayFollowUps(dashboardData.todayFollowUps)}</div></section>`;
}

window.dashboardContracts = { dashboardRoleConfig, normalizeDashboardData, dashboardMock, useDashboardData, useDashboardSummary, useLeadInflow, useLeadSources, useFollowUpPerformance, useAgentPerformance, useConversionOverview, useRecentLeads, useTodayFollowUps };
