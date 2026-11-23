import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch, apiFetchText } from '@/api/client';
import { Card, ErrorState, LoadingState, MetricCard, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { useSession } from '@/auth/session';
import { colors } from '@/theme';
import { dateRangeBounds } from '@/lib/date-range';

const ranges = [
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'this_week' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'Custom', value: 'custom' }
];

type ReportRow = Record<string, unknown>;
type ReportData = {
  summary?: ReportRow;
  leadReport?: ReportRow;
  customerReport?: ReportRow;
  followUpReport?: ReportRow;
  agentReports?: ReportRow[];
  charts?: { conversionOverview?: ReportRow[] };
  meta?: { generatedAt?: string; timezone?: string };
};
type AgentDetail = {
  agent?: ReportRow;
  overview?: ReportRow;
  leads?: ReportRow[];
  customers?: ReportRow[];
  followUps?: ReportRow[];
  activity?: ReportRow[];
};

function numberValue(row: ReportRow | undefined, ...keys: string[]) {
  const value = keys.map(key => row?.[key]).find(item => item !== undefined && item !== null);
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function percentage(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 === 0 ? 0 : 1)}%` : '0%';
}

function ReportBarList({ items }: { items: ReportRow[] }) {
  const maximum = Math.max(...items.map(item => numberValue(item, 'count', 'value')), 1);
  return <View style={styles.dashboardBarList}>
    {items.slice(0, 8).map((item, index) => {
      const label = String(item.stage ?? item.label ?? item.name ?? 'Stage');
      const value = numberValue(item, 'count', 'value');
      const width = `${Math.max((value / maximum) * 100, value > 0 ? 5 : 0)}%` as `${number}%`;
      return <View key={`${label}-${index}`} style={styles.dashboardBarRow}><View style={styles.dashboardBarMeta}><Text style={styles.dashboardBarLabel}>{label}</Text><Text style={styles.dashboardBarValue}>{value}</Text></View><View style={styles.dashboardBarTrack}><View style={[styles.dashboardBarFill, { width }]} /></View></View>;
    })}
  </View>;
}

export default function ReportsScreen() {
  const { user } = useSession();
  const canViewReports = ['super_admin', 'sales_manager', 'hr', 'project_manager'].includes(String(user?.role || '').toLowerCase());
  const [dateRange, setDateRange] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [appliedCustomStart, setAppliedCustomStart] = useState('');
  const [appliedCustomEnd, setAppliedCustomEnd] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const query = useQuery({
    queryKey: ['reports', user?.id, dateRange, appliedCustomStart, appliedCustomEnd],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ dateRange });
      if (dateRange === 'custom') { params.set('startDate', appliedCustomStart); params.set('endDate', appliedCustomEnd); }
      return apiFetch<{ data: ReportData }>(`/api/reports?${params.toString()}`, { signal });
    },
    enabled: Boolean(user) && canViewReports && (dateRange !== 'custom' || Boolean(appliedCustomStart && appliedCustomEnd))
  });
  const agentDetailQuery = useQuery({
    queryKey: ['report-agent', user?.id, selectedAgentId, dateRange, appliedCustomStart, appliedCustomEnd],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ dateRange });
      if (dateRange === 'custom') { params.set('startDate', appliedCustomStart); params.set('endDate', appliedCustomEnd); }
      return apiFetch<{ data: AgentDetail }>(`/api/reports/agents/${encodeURIComponent(selectedAgentId)}?${params.toString()}`, { signal });
    },
    enabled: Boolean(user) && canViewReports && Boolean(selectedAgentId) && (dateRange !== 'custom' || Boolean(appliedCustomStart && appliedCustomEnd))
  });

  if (!canViewReports) return <Screen><ErrorState message="Reports are not available for this CRM role." /></Screen>;

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Reports could not load. Your role may not have report access, or the server may be unavailable." onRetry={() => { void query.refetch(); }} /></Screen>;

  const report = query.data?.data || {};
  const summary = report.summary || {};
  const leadReport = report.leadReport || {};
  const customerReport = report.customerReport || {};
  const followUpReport = report.followUpReport || {};

  async function exportAgentReport() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ dateRange });
      if (dateRange === 'custom') { params.set('startDate', appliedCustomStart); params.set('endDate', appliedCustomEnd); }
      const exportOptions = { dateRange, ...(dateRange === 'custom' ? { startDate: appliedCustomStart, endDate: appliedCustomEnd } : {}) };
      const csv = await apiFetchText(`/api/reports/export?${params.toString()}`, { method: 'POST', body: JSON.stringify(exportOptions) });
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error('Temporary file storage is unavailable on this device.');
      const fileUri = `${directory}aureum-agent-report.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Aureum agent report' });
    } catch (error) { Alert.alert('Export failed', error instanceof Error ? error.message : 'The report could not be exported.'); }
    finally { setExporting(false); }
  }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Reporting" title="Performance overview" copy="The same server-side report scope used by the web CRM." />
    <SecondaryButton label={exporting ? 'Preparing CSV…' : 'Export agent report (CSV)'} onPress={() => { void exportAgentReport(); }} disabled={exporting} />
    <View style={styles.filterRow}>{ranges.map(range => <SecondaryButton key={range.value} label={range.label} active={range.value === dateRange} onPress={() => setDateRange(range.value)} />)}</View>
    {dateRange === 'custom' ? <Card><Text style={styles.rowTitle}>Custom report range</Text><TextInput value={customStartDate} onChangeText={setCustomStartDate} placeholder="Start date · YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={customEndDate} onChangeText={setCustomEndDate} placeholder="End date · YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><SecondaryButton label="Apply custom range" onPress={() => { const next = dateRangeBounds('custom', customStartDate, customEndDate); if (!next) { Alert.alert('Check dates', 'Enter valid dates in YYYY-MM-DD format, with the end date on or after the start date.'); return; } setAppliedCustomStart(next.start); setAppliedCustomEnd(next.end); }} /></Card> : null}
    <Text style={styles.dashboardScopeNote}>Range: {dateRange === 'custom' ? (appliedCustomStart && appliedCustomEnd ? `${appliedCustomStart} to ${appliedCustomEnd}` : 'Choose dates') : ranges.find(item => item.value === dateRange)?.label || dateRange}. Access is limited by your CRM role and team scope.</Text>

    <View style={styles.dashboardMetricGrid}>
      <MetricCard label="Total leads" value={numberValue(leadReport, 'totalLeads')} detail="Report scope" />
      <MetricCard label="New leads" value={numberValue(leadReport, 'newLeads')} detail="Selected range" />
      <MetricCard label="Closed deals" value={numberValue(leadReport, 'closedWon')} detail="Won" />
      <MetricCard label="Conversion" value={percentage(leadReport.conversionRate)} detail="Lead conversion" />
      <MetricCard label="Customers" value={numberValue(customerReport, 'totalCustomers')} detail="Report scope" />
      <MetricCard label="Follow-ups" value={numberValue(followUpReport, 'totalFollowUps')} detail={`${numberValue(followUpReport, 'overdueFollowUps')} overdue`} />
    </View>

    <Card><Text style={styles.rowTitle}>Conversion overview</Text>{report.charts?.conversionOverview?.length ? <ReportBarList items={report.charts.conversionOverview} /> : <Text style={styles.copy}>No conversion data in this range.</Text>}</Card>

    <Card><Text style={styles.rowTitle}>Agent performance</Text>{report.agentReports?.length ? report.agentReports.slice(0, 10).map((agent, index) => <Pressable key={`${String(agent.agentId ?? agent.agentName ?? index)}`} accessibilityRole="button" onPress={() => setSelectedAgentId(String(agent.agentId || ''))} style={styles.dashboardAgentRow}><View style={styles.dashboardAgentAvatar}><Text style={styles.dashboardAgentAvatarText}>{String(agent.agentName || 'A').slice(0, 1).toUpperCase()}</Text></View><View style={styles.rowBody}><Text style={styles.rowTitle} numberOfLines={1}>{String(agent.agentName || 'Agent')}</Text><Text style={styles.rowMeta}>{numberValue(agent, 'assignedLeads')} leads · {numberValue(agent, 'followUpsCompleted')} completed follow-ups</Text></View><Text style={styles.dashboardAgentConversion}>{percentage(agent.conversionRate)}</Text></Pressable>) : <Text style={styles.copy}>No agent performance data in this range.</Text>}</Card>
    {selectedAgentId ? <Card><View style={styles.sectionHeader}><Text style={styles.rowTitle}>Agent detail</Text><SecondaryButton label="Close" onPress={() => setSelectedAgentId('')} /></View>{agentDetailQuery.isLoading ? <Text style={styles.copy}>Loading permitted agent detail…</Text> : agentDetailQuery.isError ? <ErrorState message="Agent detail could not load." onRetry={() => { void agentDetailQuery.refetch(); }} /> : <><View style={styles.dashboardMetricGrid}><MetricCard label="Assigned leads" value={numberValue(agentDetailQuery.data?.data.overview, 'assignedLeads')} detail="Selected agent" /><MetricCard label="Closed deals" value={numberValue(agentDetailQuery.data?.data.overview, 'closedDeals')} detail="Won" /><MetricCard label="Customers" value={numberValue(agentDetailQuery.data?.data.overview, 'customersHandled')} detail="Handled" /><MetricCard label="Conversion" value={percentage(agentDetailQuery.data?.data.overview?.conversionRate)} detail="Agent rate" /></View><Text style={styles.rowMeta}>Recent leads: {agentDetailQuery.data?.data.leads?.length || 0} · Follow-ups: {agentDetailQuery.data?.data.followUps?.length || 0} · Customers: {agentDetailQuery.data?.data.customers?.length || 0}</Text>{(agentDetailQuery.data?.data.activity || []).slice(0, 5).map((entry, index) => <View key={String(entry.id || index)} style={styles.noteRow}><Text style={styles.copy}>{String(entry.description || entry.activityType || 'Agent activity')}</Text><Text style={styles.rowMeta}>{String(entry.createdAt || entry.created_at || 'Recent')}</Text></View>)}</>}</Card> : null}

    <Card><Text style={styles.rowTitle}>Server report metadata</Text><Text style={styles.copy}>Generated {report.meta?.generatedAt ? new Date(report.meta.generatedAt).toLocaleString() : 'recently'}{report.meta?.timezone ? ` · ${report.meta.timezone}` : ''}.</Text></Card>
  </Screen>;
}
