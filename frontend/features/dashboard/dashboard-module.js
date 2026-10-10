// Dashboard module: role-aware data contracts, API hooks, and presentation.
// The project is intentionally buildless, so charts use semantic SVG/CSS primitives
// instead of a runtime chart dependency while keeping the same API-ready boundaries.

const dashboardMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dashboardStatuses = ['Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled'];
const dashboardStages = ['New', 'Contacted', 'Qualified', 'Follow-up', 'Negotiation', 'Booking', 'Closed Won'];
state.dashboardDateRange = state.dashboardDateRange || 'this_month';
state.dashboardCustomStart = state.dashboardCustomStart || '';
state.dashboardCustomEnd = state.dashboardCustomEnd || '';

const dashboardRoleConfig = {
  SUPER_ADMIN: { role: 'super_admin', scope: 'company', scopeLabel: 'Company-wide data', welcome: 'Welcome back, Super Admin', welcomeCopy: 'Track company-wide leads, follow-ups, users, and sales performance.', quickActions: [['leads', 'View All Leads'], ['reports', 'View Reports'], ['agents', 'Manage Users'], ['follow-ups', 'View Follow-ups']] },
  SALES_MANAGER: { role: 'sales_manager', scope: 'team', scopeLabel: 'Team data', welcome: 'Welcome back, Sales Manager', welcomeCopy: 'Monitor team leads, follow-ups, users, and sales progress.', quickActions: [['add-lead', 'Add New Lead'], ['leads', 'View All Leads'], ['follow-ups', 'View Follow-ups'], ['reports', 'View Reports'], ['agents', 'View Users']] },
  SALES_AGENT: { role: 'sales_agent', scope: 'own', scopeLabel: 'My data only', welcome: 'Welcome back, Sales Agent', welcomeCopy: 'Manage your assigned leads, customers, and follow-ups for today.', quickActions: [['my-leads', 'View My Leads'], ['follow-ups', 'View Follow-ups'], ['customers', 'Open Customers'], ['team-chat', 'Team Chat']] }
};

const dashboardMock = {
  leadInflow: dashboardMonths.map((label, index) => ({ label, leads: [58, 72, 45, 66, 80, 55, 65, 75, 84, 100, 72, 88][index] })),
  leadSources: [{ source: 'Website', count: 437, percentage: 35 }, { source: 'WhatsApp', count: 349, percentage: 28 }, { source: 'Facebook', count: 225, percentage: 18 }, { source: 'Sales Partner', count: 150, percentage: 12 }, { source: 'Walk-in', count: 87, percentage: 7 }],
  followUpPerformance: [{ status: 'Completed', count: 184 }, { status: 'Pending', count: 56 }, { status: 'Overdue', count: 14 }, { status: 'Missed', count: 0 }, { status: 'Rescheduled', count: 28 }],
  conversionOverview: [{ stage: 'New', count: 1248, percentage: 100 }, { stage: 'Contacted', count: 892, percentage: 71 }, { stage: 'Qualified', count: 540, percentage: 43 }, { stage: 'Follow-up', count: 320, percentage: 26 }, { stage: 'Negotiation', count: 146, percentage: 12 }, { stage: 'Booking', count: 96, percentage: 8 }, { stage: 'Closed Won', count: 48, percentage: 4 }]
};

function dashboardRole() { return dashboardRoleConfig[state.role] || dashboardRoleConfig.SALES_AGENT; }
function dashboardChartColors() { return window.aureumDashboardChartColors || { gold: '#C6A15B', softGold: '#E2C67A', deepBrown: '#2A2118', softBeige: '#EFE4D2', success: '#2F6B4F', warning: '#C88A2D', error: '#B94A48', muted: '#7A7167' }; }
function dashboardEscape(value) { return window.AureumUI?.escape ? AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function dashboardNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function dashboardPercent(value, total) { const amount = dashboardNumber(value); const denominator = dashboardNumber(total); return denominator ? (amount / denominator) * 100 : 0; }
function dashboardFormatNumber(value) { return dashboardNumber(value).toLocaleString(); }
function dashboardCountLabel(value, singular) { const amount = dashboardNumber(value); return `${dashboardFormatNumber(amount)} ${singular}${amount === 1 ? '' : 's'}`; }
function dashboardTooltipText(title, lines = []) { return [title, ...lines].filter(Boolean).join(' · '); }
function dashboardTooltip(title, lines = []) { return `<span class="dashboard-chart-tooltip" aria-hidden="true"><strong>${dashboardEscape(title)}</strong>${lines.map(line => `<span>${dashboardEscape(line)}</span>`).join('')}</span>`; }

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
  const summary = raw.summary || {};
  const leadInflow = Array.isArray(raw.leadInflow) ? raw.leadInflow.map((point, index) => typeof point === 'number' ? { label: dashboardMonths[index] || `M${index + 1}`, leads: point } : { label: point.label || dashboardMonths[index], leads: dashboardNumber(point.leads), ...point }) : dashboardMock.leadInflow;
  const sourceTotal = dashboardNumber(summary.totalLeads, 0);
  const leadSources = (raw.leadSources || dashboardMock.leadSources).map(item => ({ source: item.source || item.name, count: dashboardNumber(item.count, sourceTotal ? Math.round(sourceTotal * dashboardNumber(item.percentage ?? item.value) / 100) : 0), percentage: dashboardNumber(item.percentage ?? item.value) }));
  const followUpTotal = (raw.followUpPerformance || []).reduce((total, item) => total + dashboardNumber(item.count ?? item.value), 0);
  const followUpPerformance = dashboardStatuses.map(status => { const item = (raw.followUpPerformance || []).find(entry => (entry.status || entry.name) === status); const count = dashboardNumber(item?.count ?? item?.value); return { status, count, percentage: dashboardPercent(count, followUpTotal) }; });
  const conversionOverview = dashboardStages.map(stage => { const item = (raw.conversionOverview || []).find(entry => String(entry.stage || entry.name).toLowerCase().replace('new leads', 'new').replace('closed won', 'closed won') === stage.toLowerCase()); const count = dashboardNumber(item?.count ?? item?.value); return { stage, count, percentage: dashboardNumber(item?.percentage, dashboardPercent(count, dashboardNumber(summary.totalLeads))) }; });
  const agentPerformance = (raw.agentPerformance || []).filter(Boolean).map(item => ({ agentId: item.agentId || item.id || item.name, agentName: item.agentName || item.name, teamName: item.teamName || item.team, assignedLeads: dashboardNumber(item.assignedLeads ?? item.assigned), contactedLeads: dashboardNumber(item.contactedLeads ?? item.contacted), completedFollowUps: dashboardNumber(item.completedFollowUps ?? item.completed), overdueFollowUps: dashboardNumber(item.overdueFollowUps ?? item.overdue), closedDeals: dashboardNumber(item.closedDeals ?? item.closed), conversionRate: dashboardNumber(String(item.conversionRate ?? item.conversion).replace('%', '')) }));
  const recentLeads = (raw.recentLeads || []).map((item, index) => ({ id: item.id || `recent-lead-${index + 1}`, leadName: item.leadName || item.name, phone: item.phone, source: item.source || 'Manual Entry', interestedIn: item.interestedIn || item.interest, assignedAgent: item.assignedAgent || item.agent, status: item.status, createdAt: item.createdAt || item.created }));
  const todayFollowUps = (raw.todayFollowUps || []).map((item, index) => ({ id: item.id || `today-follow-up-${index + 1}`, customerId: item.customerId || item.customer_id, customerName: item.customerName || item.customer, phone: item.phone, followUpType: item.followUpType || item.type, assignedAgent: item.assignedAgent || item.agent, dueDate: item.dueDate || item.due_date, dueTime: item.dueTime || item.time, status: item.status, priority: item.priority || (item.status === 'Overdue' ? 'High' : 'Medium') }));
  return { role: dashboardRole().role, scope: dashboardRole().scope, dateRange: state.dashboardDateRange, summary, leadInflow, leadSources, followUpPerformance, agentPerformance: state.role === 'SALES_AGENT' ? [] : agentPerformance, conversionOverview, recentLeads, todayFollowUps, scopeLabel: dashboardRole().scopeLabel, meta: { generatedAt: raw.meta?.generatedAt || new Date().toISOString(), timezone: 'Asia/Karachi', currency: 'PKR' } };
}

async function dashboardEndpoint(path) { const query = new URLSearchParams({ role: dashboardRole().role, scope: dashboardRole().scope, dateRange: state.dashboardDateRange }); if (state.dashboardCustomStart) query.set('startDate', state.dashboardCustomStart); if (state.dashboardCustomEnd) query.set('endDate', state.dashboardCustomEnd); const result = await apiFetch(`${path}?${query.toString()}`); return result.data ?? result; }

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
  const colors = dashboardChartColors();
  const values = points.map(point => dashboardNumber(point.leads));
  const rawMax = Math.max(...values, 1);
  const width = 700;
  const height = 280;
  const plot = { left: 54, right: 18, top: 18, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  // Keep the executive chart legible when a workspace has only a few records.
  // Tooltips and accessible labels still expose the exact point value.
  const minimumScale = 60;
  const roughStep = Math.max(rawMax, minimumScale) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep || 1));
  const normalizedStep = roughStep / magnitude;
  const stepUnit = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
  const tickStep = Math.max(10, stepUnit * magnitude);
  const chartMax = Math.max(minimumScale, Math.ceil(rawMax / tickStep) * tickStep);
  const tickValues = Array.from({ length: Math.round(chartMax / tickStep) + 1 }, (_, index) => index * tickStep);
  const formatTick = value => Number.isInteger(value) ? dashboardFormatNumber(value) : value.toFixed(1);
  const xFor = index => plot.left + index * (plotWidth / Math.max(values.length - 1, 1));
  const yFor = value => plot.top + plotHeight - ((value / chartMax) * plotHeight);
  const coords = values.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
  const line = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${coords.at(-1)?.x || plot.left + plotWidth} ${plot.top + plotHeight} L ${coords[0]?.x || plot.left} ${plot.top + plotHeight} Z`;
  const grid = tickValues.map(value => { const y = yFor(value).toFixed(1); return `<line class="chart-gridline" x1="${plot.left}" x2="${plot.left + plotWidth}" y1="${y}" y2="${y}"/><text class="chart-axis-number" x="${plot.left - 10}" y="${Number(y) + 3.5}" text-anchor="end">${dashboardEscape(formatTick(value))}</text>`; }).join('');
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 6));
  const labelIndexes = points.map((_, index) => index).filter(index => index === 0 || index === points.length - 1 || index % labelStep === 0);
  const xLabels = labelIndexes.map(index => { const label = points[index]?.label || dashboardMonths[index] || `Point ${index + 1}`; return `<text class="chart-axis-label" x="${xFor(index)}" y="${height - 23}" text-anchor="middle">${dashboardEscape(label)}</text>`; }).join('');
  const pointCircles = coords.map((point, index) => { const label = points[index]?.label || dashboardMonths[index] || `Point ${index + 1}`; const value = dashboardCountLabel(values[index], 'lead'); return `<circle cx="${point.x}" cy="${point.y}" r="4" style="stroke:${colors.gold}"><title>${dashboardEscape(dashboardTooltipText(label, [value]))}</title></circle>`; }).join('');
  const hotspots = coords.map((point, index) => { const label = points[index]?.label || dashboardMonths[index] || `Point ${index + 1}`; const value = dashboardCountLabel(values[index], 'lead'); const text = dashboardTooltipText(label, [value]); const edgeClass = index === 0 ? ' is-first' : index === coords.length - 1 ? ' is-last' : ''; return `<span class="dashboard-line-hotspot dashboard-tooltip-anchor${edgeClass}" style="left:${((point.x / width) * 100).toFixed(2)}%;top:${((point.y / height) * 100).toFixed(2)}%" tabindex="0" aria-label="${dashboardEscape(text)}">${dashboardTooltip(label, [value])}</span>`; }).join('');
  return `<div class="dashboard-line-chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Lead inflow trend chart. Dates are shown horizontally and lead count is shown vertically."><defs><linearGradient id="lead-inflow-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${colors.gold}" stop-opacity=".34"/><stop offset="100%" stop-color="${colors.gold}" stop-opacity=".02"/></linearGradient></defs>${grid}<line class="chart-axis" x1="${plot.left}" x2="${plot.left}" y1="${plot.top}" y2="${plot.top + plotHeight}"/><line class="chart-axis" x1="${plot.left}" x2="${plot.left + plotWidth}" y1="${plot.top + plotHeight}" y2="${plot.top + plotHeight}"/><path class="chart-area" d="${area}"/><path class="chart-line" d="${line}" style="stroke:${colors.gold}"/>${pointCircles}${xLabels}<text class="chart-axis-title chart-axis-title-y" x="14" y="${plot.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${plot.top + plotHeight / 2})">Leads</text><text class="chart-axis-title" x="${plot.left + plotWidth / 2}" y="${height - 3}" text-anchor="middle">Date</text></svg><div class="dashboard-line-hotspots">${hotspots}</div></div>`;
}

function dashboardSourceChart(items) { const palette = dashboardChartColors(); const colors = [palette.gold, palette.softGold, palette.deepBrown, palette.success, palette.softBeige, palette.warning, palette.error]; const total = items.reduce((sum, item) => sum + dashboardNumber(item.percentage), 0) || 100; const visibleTotal = items.reduce((sum, item) => sum + dashboardNumber(item.count), 0); let offset = 0; const stops = items.map((item, index) => { const start = offset; offset += (dashboardNumber(item.percentage) / total) * 100; return `${colors[index % colors.length]} ${start}% ${offset}%`; }).join(', '); return `<div class="dashboard-source-layout"><div class="dashboard-donut dashboard-tooltip-anchor" style="background:conic-gradient(${stops})" tabindex="0" aria-label="${dashboardEscape(dashboardTooltipText('Visible leads', [`${dashboardFormatNumber(visibleTotal)} total`]))}"><div><strong>${dashboardEscape(dashboardFormatNumber(visibleTotal))}</strong><span>Visible leads</span></div>${dashboardTooltip('Visible leads', [`${dashboardFormatNumber(visibleTotal)} total`])}</div><div class="dashboard-source-list">${items.map((item, index) => { const percentage = dashboardNumber(item.percentage); const count = dashboardCountLabel(item.count, 'lead'); const text = dashboardTooltipText(item.source, [`${percentage}% of visible leads`, count]); return `<div class="dashboard-source-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><span><i style="background:${colors[index % colors.length]}"></i>${dashboardEscape(item.source)}</span><b>${percentage}%</b>${dashboardTooltip(item.source, [`${percentage}% of visible leads`, count])}</div>`; }).join('')}</div></div>`; }

function dashboardFollowUpChart(items) { const max = Math.max(...items.map(item => dashboardNumber(item.count)), 1); return `<div class="dashboard-performance-list">${items.map(item => { const count = dashboardNumber(item.count); const percentage = dashboardNumber(item.percentage).toFixed(0); const countLabel = dashboardCountLabel(count, 'follow-up'); const text = dashboardTooltipText(item.status, [countLabel, `${percentage}% of activity`]); return `<div class="dashboard-performance-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><div><span>${dashboardEscape(item.status)}</span><small>${percentage}% of activity</small></div><div class="dashboard-performance-track"><i class="dashboard-${item.status.toLowerCase()}" style="width:${Math.max(3, dashboardPercent(item.count, max))}%"></i></div><b>${count}</b>${dashboardTooltip(item.status, [countLabel, `${percentage}% of activity`])}</div>`; }).join('')}</div>`; }

function dashboardAgentChart(items) { if (!items.length) return '<div class="dashboard-empty">Agent performance is not available for this role.</div>'; return `<div class="dashboard-agent-list">${items.slice(0, 5).map(item => { const conversion = item.conversionRate.toFixed(1); const lines = [dashboardCountLabel(item.assignedLeads, 'assigned lead'), dashboardCountLabel(item.closedDeals, 'closed deal'), dashboardCountLabel(item.overdueFollowUps, 'overdue follow-up')]; const text = dashboardTooltipText(item.agentName, [`${conversion}% conversion`, ...lines]); return `<div class="dashboard-agent-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><div class="dashboard-agent-avatar">${dashboardEscape(item.agentName.split(' ').map(part => part[0]).join('').slice(0, 2))}</div><div class="dashboard-agent-main"><strong>${dashboardEscape(item.agentName)}</strong><span>${dashboardEscape(item.teamName || 'Sales team')} · ${dashboardCountLabel(item.assignedLeads, 'assigned lead')}</span><div class="dashboard-agent-track"><i style="width:${Math.min(100, item.conversionRate * 4)}%"></i></div></div><b>${conversion}%</b>${dashboardTooltip(item.agentName, [`${conversion}% conversion`, ...lines])}</div>`; }).join('')}</div>`; }

function dashboardConversionChart(items) { const max = Math.max(...items.map(item => dashboardNumber(item.count)), 1); return `<div class="dashboard-conversion-list">${items.map(item => { const count = dashboardNumber(item.count); const percentage = dashboardNumber(item.percentage).toFixed(0); const countLabel = dashboardCountLabel(count, 'lead'); const text = dashboardTooltipText(item.stage, [countLabel, `${percentage}% of total pipeline`]); return `<div class="dashboard-conversion-row dashboard-tooltip-anchor" tabindex="0" aria-label="${dashboardEscape(text)}"><span>${dashboardEscape(item.stage)}</span><div><i style="width:${Math.max(2, dashboardPercent(item.count, max))}%"></i></div><b>${dashboardFormatNumber(count)}</b>${dashboardTooltip(item.stage, [countLabel, `${percentage}% of total pipeline`])}</div>`; }).join('')}</div>`; }

function dashboardRecentLeads(items) { if (!items.length) return '<div class="dashboard-empty">No recent leads found.</div>'; return `<div class="table-wrap dashboard-table-wrap"><table class="dashboard-data-table"><thead><tr><th>Lead Name</th><th>Source</th><th>Interested In</th><th>Assigned Agent</th><th>Status</th><th>Created Date</th></tr></thead><tbody>${items.slice(0, 6).map(item => `<tr><td>${person(dashboardEscape(item.leadName), dashboardEscape(item.leadName.split(' ').map(part => part[0]).join('').slice(0, 2)), dashboardEscape(item.phone || ''))}</td><td>${dashboardEscape(item.source)}</td><td>${dashboardEscape(item.interestedIn)}</td><td>${dashboardEscape(item.assignedAgent || 'Unassigned')}</td><td>${badge(item.status)}</td><td>${dashboardEscape(item.createdAt)}</td></tr>`).join('')}</tbody></table></div>`; }

function dashboardTodayFollowUps(items) { if (!items.length) { const range = dashboardDateRangeLabel(); return `<div class="dashboard-empty">${range === 'Today' ? 'No follow-ups due today.' : `No follow-ups found for ${range.toLowerCase()}.`}</div>`; } return `<div class="dashboard-followup-list">${items.slice(0, 6).map(item => `<div class="dashboard-followup-row ${item.status === 'Overdue' ? 'is-overdue' : ''}"><div class="dashboard-followup-time">${dashboardEscape(item.dueTime)}</div><div class="dashboard-followup-main"><strong>${dashboardEscape(item.customerName)}</strong><span>${dashboardEscape(item.followUpType)} · ${dashboardEscape(item.assignedAgent || 'Unassigned')}</span></div><div>${badge(item.status)}</div></div>`).join('')}</div>`; }

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
    const kpi = event.target.closest?.('[data-dashboard-kpi]');
    if (kpi) { dashboardNavigateFromKpi(kpi); return; }
    const apply = event.target.closest?.('[data-dashboard-apply-range]');
    if (apply) { state.dashboardCustomStart = document.querySelector('[data-dashboard-start]')?.value || ''; state.dashboardCustomEnd = document.querySelector('[data-dashboard-end]')?.value || ''; loadDashboard(); return; }
    const clear = event.target.closest?.('[data-dashboard-clear-range]');
    if (clear) { state.dashboardDateRange = 'this_month'; state.dashboardCustomStart = ''; state.dashboardCustomEnd = ''; loadDashboard(); }
  });
  document.addEventListener('change', event => { if (event.target.matches?.('[data-dashboard-date-range]')) { state.dashboardDateRange = event.target.value; if (state.dashboardDateRange === 'custom') render(); else loadDashboard(); } });
  document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('[data-dashboard-kpi]')) { event.preventDefault(); dashboardNavigateFromKpi(event.target); } });
}

function renderDashboard() {
  const role = dashboardRole(); const data = state.dashboard.data ? normalizeDashboardData(state.dashboard.data) : null;
  if (state.dashboard.loading && !data) return pageHeader('Aureum Sales CRM', 'Dashboard', 'Track Aureum leads, customers, follow-ups, and sales performance from one place.') + '<section class="dashboard-loading-grid"><div class="dashboard-skeleton dashboard-skeleton-banner"></div><div class="dashboard-skeleton dashboard-skeleton-kpis"></div><div class="dashboard-skeleton dashboard-skeleton-charts"></div></section>';
  if (state.dashboard.error && !data) return pageHeader('Aureum Sales CRM', 'Dashboard', 'Track Aureum leads, customers, follow-ups, and sales performance from one place.', '<button class="btn btn-gold" data-reload-dashboard>Try again</button>') + `<section class="dashboard-error card"><div class="dashboard-error-mark">!</div><h2>Unable to load dashboard data</h2><p>${dashboardEscape(state.dashboard.error)} Please try again.</p></section>`;
  const baseData = data || normalizeDashboardData({}); const dashboardData = dashboardFilteredRecords(baseData); const isAgent = state.role === 'SALES_AGENT'; const actions = dashboardQuickActions(role.quickActions); const refresh = '<button class="btn btn-secondary btn-sm" data-reload-dashboard>Refresh dashboard</button>';
  return pageHeader('Aureum Sales CRM', 'Dashboard', 'Track Aureum leads, customers, follow-ups, and sales performance from one place.', refresh) + `<section class="dashboard-welcome"><div><div class="eyebrow">✦ The Perfect Blend of Serenity and Luxury</div><h2>${role.welcome}</h2><p>${role.welcomeCopy}</p><span class="dashboard-scope">${dashboardEscape(dashboardData.scopeLabel)} · Live ${dashboardEscape(dashboardData.meta.timezone)} data</span></div><div class="dashboard-welcome-side">${dashboardDateFilter()}<div class="dashboard-welcome-mark">A</div></div></section><section class="dashboard-kpi-grid">${dashboardSummaryKpis(dashboardData.summary, state.role)}</section><section class="dashboard-chart-grid">${dashboardCard('Lead Inflow Trend', `${dashboardDateRangeLabel()} inquiry velocity across the permitted scope`, dashboardLineChart(dashboardData.leadInflow), 'dashboard-chart-wide')}${dashboardCard('Lead Sources', 'Acquisition channels distribution', dashboardSourceChart(dashboardData.leadSources))}</section><section class="dashboard-chart-grid">${dashboardCard('Follow-up Performance', 'Scheduled advisor client resolution', dashboardFollowUpChart(dashboardData.followUpPerformance))}${!isAgent ? dashboardCard('Agent Performance', 'Conversion benchmark across permitted advisors', dashboardAgentChart(dashboardData.agentPerformance)) : dashboardCard('Conversion Overview', 'Funnel progression from inquiry to booking', dashboardConversionChart(dashboardData.conversionOverview))}</section>${!isAgent ? `<section class="dashboard-chart-grid">${dashboardCard('Conversion Overview', 'Funnel progression from inquiry to booking', dashboardConversionChart(dashboardData.conversionOverview))}<div class="card dashboard-actions-card"><div class="dashboard-card-heading"><div><h3>Quick Actions</h3><p>Move from insight to the next best action.</p></div></div>${actions}</div></section>` : `<section class="card dashboard-actions-card" style="margin-top:18px"><div class="dashboard-card-heading"><div><h3>Quick Actions</h3><p>Keep today’s assigned relationships moving.</p></div></div>${actions}</section>`}<section class="dashboard-content-grid"><div class="card dashboard-table-card"><div class="dashboard-card-heading"><div><h3>Recent Leads</h3><p>Latest permitted investor inquiries.</p></div><button class="section-link" data-screen="${isAgent ? 'my-leads' : 'leads'}">View all ${icons.arrow}</button></div>${dashboardRecentLeads(dashboardData.recentLeads)}</div><div class="card dashboard-followup-card"><div class="dashboard-card-heading"><div><h3>${dashboardDateRangeLabel()} Follow-ups</h3><p>${isAgent ? 'Your scheduled client touchpoints.' : 'Scheduled team touchpoints.'}</p></div><button class="section-link" data-screen="follow-ups">View all ${icons.arrow}</button></div>${dashboardTodayFollowUps(dashboardData.todayFollowUps)}</div></section>`;
}

bindDashboardModuleEvents();
window.dashboardContracts = { dashboardRoleConfig, normalizeDashboardData, dashboardMock, useDashboardData, useDashboardSummary, useLeadInflow, useLeadSources, useFollowUpPerformance, useAgentPerformance, useConversionOverview, useRecentLeads, useTodayFollowUps };
