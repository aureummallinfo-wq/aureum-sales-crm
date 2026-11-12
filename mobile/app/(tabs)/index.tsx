import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingState, MetricCard, PageTitle, Screen, styles } from '@/components/ui';
import { DashboardInitial, FollowUp, Lead } from '@/types/api';

const ranges = [
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'this_week' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' }
];

export default function DashboardScreen() {
  const { user } = useSession();
  const [dateRange, setDateRange] = useState('this_month');
  const query = useQuery({
    queryKey: ['dashboard', user?.id, dateRange],
    queryFn: () => apiFetch<{ data: DashboardInitial }>(`/api/dashboard/initial?dateRange=${dateRange}`),
    enabled: Boolean(user)
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="The dashboard could not load. Pull to refresh and try again." /></Screen>;

  const dashboard = query.data?.data;
  const summary = dashboard?.summary || {};
  const recentLeads = dashboard?.recentLeads || [];
  const todayFollowUps = dashboard?.todayFollowUps || [];
  const canCreateLead = ['super_admin', 'sales_manager', 'sales_agent'].includes(String(user?.role || '').toLowerCase());

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Aureum CRM" title={`Welcome back${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`} copy="Keep today’s pipeline and customer commitments moving." />

    <View style={styles.dashboardActions}>
      {canCreateLead ? <Pressable accessibilityRole="button" onPress={() => router.push('/lead/new')} style={styles.dashboardPrimaryAction}><Text style={styles.dashboardPrimaryActionText}>＋ Add lead</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/tasks')} style={styles.dashboardSecondaryAction}><Text style={styles.dashboardSecondaryActionText}>View tasks</Text></Pressable>
    </View>

    <View style={styles.filterRow}>
      {ranges.map(range => <Pressable key={range.value} onPress={() => setDateRange(range.value)} style={[styles.filterChip, dateRange === range.value && styles.filterChipActive]}><Text style={[styles.filterChipText, dateRange === range.value && styles.filterChipTextActive]}>{range.label}</Text></Pressable>)}
    </View>

    <View style={styles.dashboardMetricGrid}>
      <MetricCard label="Total leads" value={summary.totalLeads ?? 0} detail="Selected range" />
      <MetricCard label="New leads" value={summary.newLeads ?? 0} detail="Current intake" />
      <MetricCard label="Hot leads" value={summary.hotLeads ?? 0} detail="High intent" />
      <MetricCard label="Follow-ups due" value={summary.followUpsDue ?? 0} detail={`${summary.overdueFollowUps ?? 0} overdue`} />
    </View>

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
