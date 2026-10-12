const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../../..');

function loadDashboardContracts() {
  const source = fs.readFileSync(path.join(ROOT, 'frontend/features/dashboard/dashboard-module.js'), 'utf8');
  const context = {
    state: { role: 'SALES_MANAGER', dashboardDateRange: 'this_month' },
    window: { aureumDashboardEventsBound: false },
    document: { addEventListener() {} },
    console,
    Date,
    URLSearchParams,
    Intl,
    Number,
    String,
    Math,
    Array,
    Object
  };
  vm.runInNewContext(source, context, { filename: 'dashboard-module.js' });
  return context.window.dashboardContracts;
}

test('dashboard normalizes empty and malformed payloads into safe defaults', () => {
  const { normalizeDashboardData } = loadDashboardContracts();

  for (const value of [{}, null, { recentLeads: null }, { data: { recent_leads: null } }]) {
    const result = normalizeDashboardData(value);
    assert.equal(result.summary.totalLeads, 0);
    assert.equal(result.recentLeads.length, 0);
    assert.equal(result.recentActivities.length, 0);
    assert.equal(result.todayFollowUps.length, 0);
    assert.ok(Array.isArray(result.leadInflow));
    assert.ok(Array.isArray(result.leadSources));
  }
});

test('dashboard normalizes alternate Neon/API field names and missing values', () => {
  const { normalizeDashboardData } = loadDashboardContracts();
  const result = normalizeDashboardData({
    stats: { total_leads: '2' },
    recent_leads: [
      { lead_name: 'Test Lead', assigned_agent: null, status: null, phone: null },
      { full_name: null, agent: null, source: null, interest: null, created_at: null }
    ],
    recentActivities: [{ customerName: 'Customer A' }],
    upcoming_follow_ups: [{ agentName: null }],
    top_agents: [{ name: null, conversion: null }]
  });

  assert.equal(result.summary.totalLeads, 2);
  assert.equal(result.recentLeads[0].leadName, 'Test Lead');
  assert.equal(result.recentLeads[0].assignedAgent, 'Unassigned');
  assert.equal(result.recentLeads[0].status, 'Unknown');
  assert.equal(result.recentLeads[0].phone, 'No phone');
  assert.equal(result.recentLeads[1].leadName, 'Unknown Lead');
  assert.equal(result.recentLeads[1].source, 'N/A');
  assert.equal(result.recentLeads[1].interestedIn, 'N/A');
  assert.equal(result.recentLeads[1].createdAt, 'No date');
  assert.equal(result.recentActivities[0].customerName, 'Customer A');
  assert.equal(result.todayFollowUps[0].assignedAgent, 'Unassigned');
  assert.equal(result.agentPerformance[0].agentName, 'Unassigned');
});

test('dashboard name and initials helpers never call methods on undefined', () => {
  const { dashboardInitials, dashboardLeadName, dashboardAgentName } = loadDashboardContracts();

  assert.equal(dashboardInitials(undefined), 'UL');
  assert.equal(dashboardInitials(null), 'UL');
  assert.equal(dashboardInitials(''), 'UL');
  assert.equal(dashboardInitials('Ali Khan'), 'AK');
  assert.equal(dashboardLeadName({}), 'Unknown Lead');
  assert.equal(dashboardAgentName({}), 'Unassigned');
});

test('dashboard cache stores only aggregate data, expires quickly, and invalidates', () => {
  const { DASHBOARD_CACHE_TTL_MS, normalizeDashboardData, dashboardWriteCache, dashboardReadCache, invalidateDashboardCache } = loadDashboardContracts();
  const data = normalizeDashboardData({
    summary: { totalLeads: 5 },
    recentLeads: [{ full_name: 'Do not cache this name' }],
    agentPerformance: [{ full_name: 'Do not cache this user' }]
  });

  assert.equal(DASHBOARD_CACHE_TTL_MS, 30_000);
  dashboardWriteCache(data);
  const cached = dashboardReadCache();
  assert.equal(cached.summary.totalLeads, 5);
  assert.equal(cached.recentLeads.length, 0);
  assert.equal(cached.agentPerformance.length, 0);

  invalidateDashboardCache();
  assert.equal(dashboardReadCache(), null);
});

test('dashboard chart scales small datasets and formats date labels', () => {
  const { dashboardChartMax, dashboardChartLabel, dashboardLineChart } = loadDashboardContracts();

  assert.equal(dashboardChartMax([0]), 1);
  assert.equal(dashboardChartMax([1]), 2);
  assert.equal(dashboardChartMax([2, 4]), 5);
  assert.equal(dashboardChartMax([6]), 10);
  assert.equal(dashboardChartMax([11]), 25);
  assert.equal(dashboardChartMax([26]), 50);
  assert.equal(dashboardChartMax([61]), 70);
  assert.equal(dashboardChartLabel('2026-10-07'), 'Oct 7');
  assert.equal(dashboardChartLabel('2026-10'), 'Oct 2026');

  const chart = dashboardLineChart([
    { label: '2026-10-07', leads: 2 },
    { label: '2026-10-08', leads: 2 }
  ], 4);
  assert.match(chart, /Oct 7/);
  assert.match(chart, /Oct 8/);
  assert.match(chart, /class="chart-line"/);
  assert.doesNotMatch(chart, /No leads were created/);
  assert.match(dashboardLineChart([{ label: '2026-10-07', leads: 0 }], 0), /No leads were created in this date range/);
});
