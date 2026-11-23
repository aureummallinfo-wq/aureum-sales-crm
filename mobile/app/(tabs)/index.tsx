import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingState, MetricCard, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { DashboardInitial, FollowUp, Lead } from '@/types/api';
import { colors } from '@/theme';
import { dateRangeBounds } from '@/lib/date-range';

const ranges = [
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'this_week' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'Custom', value: 'custom' }
];

type DashboardPoint = Record<string, unknown>;

function pointLabel(point: DashboardPoint, fallback: string) {
  return String(point.label ?? point.name ?? point.stage ?? point.agentName ?? point.agent_name ?? fallback);
}

function pointValue(point: DashboardPoint) {
  const value = point.value ?? point.leads ?? point.count ?? point.assignedLeads ?? point.assigned_leads ?? 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percent(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 === 0 ? 0 : 1)}%` : '0%';
}

function BarList({ items, emptyText, showPercent = false }: { items: DashboardPoint[]; emptyText: string; showPercent?: boolean }) {
  const maximum = Math.max(...items.map(pointValue), 1);
  const total = items.reduce((sum, item) => sum + pointValue(item), 0);
  if (!items.length) return <Text style={styles.copy}>{emptyText}</Text>;
  return <View style={styles.dashboardBarList}>
    {items.slice(0, 8).map((item, index) => {
      const value = pointValue(item);
      const width = `${Math.max((value / maximum) * 100, value > 0 ? 5 : 0)}%` as `${number}%`;
      return <View key={`${pointLabel(item, 'Item')}-${index}`} style={styles.dashboardBarRow}>
        <View style={styles.dashboardBarMeta}><Text style={styles.dashboardBarLabel} numberOfLines={1}>{pointLabel(item, 'Item')}</Text><Text style={styles.dashboardBarValue}>{showPercent ? percent(total ? (value / total) * 100 : 0) : value}</Text></View>
        <View style={styles.dashboardBarTrack}><View style={[styles.dashboardBarFill, { width }]} /></View>
      </View>;
    })}
  </View>;
}

function DashboardSection({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return <Card><View style={styles.sectionHeader}><Text style={styles.rowTitle}>{title}</Text>{action ? <Pressable onPress={() => router.push('/(tabs)/reports')}><Text style={styles.linkText}>{action}</Text></Pressable> : null}</View>{children}</Card>;
}

export default function DashboardScreen() {
  const { user } = useSession();
  const [dateRange, setDateRange] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [appliedCustomStart, setAppliedCustomStart] = useState('');
  const [appliedCustomEnd, setAppliedCustomEnd] = useState('');
  const [showAllAgents, setShowAllAgents] = useState(false);
  const canFetchDashboard = Boolean(user) && (dateRange !== 'custom' || Boolean(appliedCustomStart && appliedCustomEnd));
  const query = useQuery({
    queryKey: ['dashboard', user?.id, dateRange, appliedCustomStart, appliedCustomEnd],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ dateRange });
      if (dateRange === 'custom') { params.set('startDate', appliedCustomStart); params.set('endDate', appliedCustomEnd); }
      return apiFetch<{ data: DashboardInitial }>(`/api/dashboard/initial?${params.toString()}`, { signal });
    },
    enabled: canFetchDashboard,
    placeholderData: keepPreviousData
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="The dashboard could not load. Pull to refresh and try again." onRetry={() => { void query.refetch(); }} /></Screen>;

  const dashboard = query.data?.data;
  const summary = dashboard?.summary || {};
  const recentLeads = dashboard?.recentLeads || [];
  const todayFollowUps = dashboard?.todayFollowUps || [];
  const canCreateLead = ['super_admin', 'sales_manager', 'sales_agent'].includes(String(user?.role || '').toLowerCase());
  const canSeeAgentPerformance = ['super_admin', 'sales_manager', 'project_manager'].includes(String(user?.role || '').toLowerCase());

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Aureum CRM" title={`Welcome back${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`} copy="Keep today’s pipeline and customer commitments moving." />

    <View style={styles.dashboardActions}>
      {canCreateLead ? <Pressable accessibilityRole="button" onPress={() => router.push('/lead/new')} style={styles.dashboardPrimaryAction}><Text style={styles.dashboardPrimaryActionText}>＋ Add lead</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/tasks')} style={styles.dashboardSecondaryAction}><Text style={styles.dashboardSecondaryActionText}>View tasks</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/follow-ups')} style={styles.dashboardSecondaryAction}><Text style={styles.dashboardSecondaryActionText}>Follow-ups</Text></Pressable>
    </View>

    <View style={styles.filterRow}>
      {ranges.map(range => <Pressable key={range.value} onPress={() => setDateRange(range.value)} style={[styles.filterChip, dateRange === range.value && styles.filterChipActive]}><Text style={[styles.filterChipText, dateRange === range.value && styles.filterChipTextActive]}>{range.label}</Text></Pressable>)}
    </View>

    {dateRange === 'custom' ? <Card><Text style={styles.rowTitle}>Custom date range</Text><Text style={styles.copy}>Use YYYY-MM-DD dates. The server applies the same Pakistan timezone rules as the web CRM.</Text><TextInput value={customStartDate} onChangeText={setCustomStartDate} placeholder="Start date · 2026-11-01" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={customEndDate} onChangeText={setCustomEndDate} placeholder="End date · 2026-11-12" placeholderTextColor={colors.muted} style={styles.input} /><Pressable style={styles.dashboardPrimaryAction} onPress={() => { const next = dateRangeBounds('custom', customStartDate, customEndDate); if (!next) { Alert.alert('Check dates', 'Enter valid dates in YYYY-MM-DD format, with the end date on or after the start date.'); return; } setAppliedCustomStart(next.start); setAppliedCustomEnd(next.end); }}><Text style={styles.dashboardPrimaryActionText}>Apply custom range</Text></Pressable></Card> : null}

    <Text style={styles.dashboardScopeNote}>Dashboard range: {dateRange === 'custom' ? (appliedCustomStart && appliedCustomEnd ? `${appliedCustomStart} to ${appliedCustomEnd}` : 'Choose dates') : ranges.find(item => item.value === dateRange)?.label || 'Selected range'}. All Leads shows the complete permitted registry.</Text>

    <View style={styles.dashboardMetricGrid}>
      <MetricCard label="Leads in range" value={summary.totalLeads ?? 0} detail="Selected range" />
      <MetricCard label="New leads" value={summary.newLeads ?? 0} detail="Current intake" />
      <MetricCard label="Hot leads" value={summary.hotLeads ?? 0} detail="High intent" />
      <MetricCard label="Follow-ups due" value={summary.followUpsDue ?? 0} detail={`${summary.overdueFollowUps ?? 0} overdue`} />
      <MetricCard label="Overdue follow-ups" value={summary.overdueFollowUps ?? 0} detail="Action required" />
      <MetricCard label="Active customers" value={summary.activeCustomers ?? 0} detail="Current relationships" />
      <MetricCard label="Closed deals" value={summary.closedDeals ?? 0} detail="Selected range" />
      <MetricCard label="Conversion rate" value={percent(summary.conversionRate)} detail="Selected range" />
    </View>

    <DashboardSection title="Lead inflow trend" action={canSeeAgentPerformance ? 'Reports' : undefined}><BarList items={dashboard?.leadInflow || []} emptyText="No lead inflow data in this range." /></DashboardSection>
    <DashboardSection title="Lead sources"><BarList items={dashboard?.leadSources || []} emptyText="No lead source data in this range." showPercent /></DashboardSection>
    <DashboardSection title="Follow-up performance"><BarList items={dashboard?.followUpPerformance || []} emptyText="No follow-up performance data in this range." /></DashboardSection>
    <DashboardSection title="Conversion overview"><BarList items={dashboard?.conversionOverview || []} emptyText="No conversion data in this range." /></DashboardSection>

    {canSeeAgentPerformance ? <DashboardSection title="Agent performance" action="Reports"><View style={styles.dashboardBarList}>
      {(showAllAgents ? (dashboard?.agentPerformance || []) : (dashboard?.agentPerformance || []).slice(0, 8)).map((agent, index) => <View key={`${pointLabel(agent, 'Agent')}-${index}`} style={styles.dashboardAgentRow}>
        <View style={styles.dashboardAgentAvatar}><Text style={styles.dashboardAgentAvatarText}>{pointLabel(agent, 'A').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.rowBody}><Text style={styles.rowTitle} numberOfLines={1}>{pointLabel(agent, 'Agent')}</Text><Text style={styles.rowMeta}>{Number(agent.assignedLeads ?? agent.assigned_leads ?? 0)} leads · {Number(agent.followUpsCompleted ?? agent.follow_ups_completed ?? 0)} follow-ups</Text></View>
        <Text style={styles.dashboardAgentConversion}>{percent(agent.conversionRate ?? agent.conversion_rate)}</Text>
      </View>)}
      {!dashboard?.agentPerformance?.length ? <Text style={styles.copy}>No agent performance data in this range.</Text> : null}
      {(dashboard?.agentPerformance?.length || 0) > 8 ? <SecondaryButton label={showAllAgents ? 'Show fewer agents' : `Show all agents (${dashboard?.agentPerformance?.length})`} onPress={() => setShowAllAgents(value => !value)} /> : null}
      </View>
    </DashboardSection> : null}

    <Card>
      <View style={styles.sectionHeader}><Text style={styles.rowTitle}>Recent leads</Text><Pressable onPress={() => router.push('/(tabs)/leads')}><Text style={styles.linkText}>See all</Text></Pressable></View>
      {recentLeads.slice(0, 5).map((lead: Lead) => <Pressable key={lead.id} onPress={() => router.push(`/lead/${lead.id}`)} style={styles.dashboardRow}><View style={styles.rowBody}><Text style={styles.rowTitle}>{lead.full_name}</Text><Text style={styles.rowMeta}>{lead.status || 'New'} · {lead.assigned_agent || 'Unassigned'}</Text></View><Text style={styles.dashboardRowChevron}>›</Text></Pressable>)}
      {!recentLeads.length ? <Text style={styles.copy}>No recent leads in this range.</Text> : null}
    </Card>

    <Card>
      <View style={styles.sectionHeader}><Text style={styles.rowTitle}>Today’s follow-ups</Text><Pressable onPress={() => router.push('/(tabs)/follow-ups')}><Text style={styles.linkText}>See all</Text></Pressable></View>
      {todayFollowUps.slice(0, 5).map((item: FollowUp) => <Pressable key={item.id} onPress={() => router.push(`/follow-up/${item.id}`)} style={styles.dashboardRow}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.customer_name || 'Customer'}</Text><Text style={styles.rowMeta}>{item.due_time || 'Any time'} · {item.follow_up_type || 'Follow-up'} · {item.status || 'Pending'}</Text></View><Text style={styles.dashboardRowChevron}>›</Text></Pressable>)}
      {!todayFollowUps.length ? <Text style={styles.copy}>No follow-ups scheduled for today.</Text> : null}
    </Card>

    <Card><Text style={styles.rowTitle}>Mobile workspace</Text><Text style={styles.copy}>Your dashboard is scoped to the signed-in user and loaded from the existing CRM API. Pull down to refresh the latest data.</Text></Card>
  </Screen>;
}
