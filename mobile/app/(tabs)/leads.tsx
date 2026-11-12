import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';
import { ApiList, Lead } from '@/types/api';

const statusFilters = ['All', 'New', 'Hot', 'Follow-up', 'Closed Won'];

export default function LeadsScreen() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const canCreate = ['super_admin', 'sales_manager', 'sales_agent'].includes(String(user?.role || '').toLowerCase());
  const basePath = user?.role === 'sales_agent' ? '/api/leads/my' : '/api/leads';
  const params = new URLSearchParams({ page: '1', pageSize: '25' });
  if (search.trim()) params.set('q', search.trim());
  if (status !== 'All') params.set('status', status);
  const endpoint = `${basePath}?${params.toString()}`;
  const query = useQuery({ queryKey: ['leads', user?.role, search, status], queryFn: () => apiFetch<ApiList<Lead>>(endpoint), enabled: Boolean(user) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="The lead registry could not load." /></Screen>;
  const leads = query.data?.data || [];
  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Pipeline" title={user?.role === 'sales_agent' ? 'My Leads' : 'Leads'} copy={`${query.data?.meta?.total ?? leads.length} permitted records`} />
    {canCreate ? <PrimaryButton label="+ Add new lead" onPress={() => router.push('/lead/new')} /> : null}
    <Card><TextInput autoCapitalize="none" value={search} onChangeText={setSearch} placeholder="Search name, phone, email…" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.filterRow}>{statusFilters.map(item => <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filterChip, status === item && styles.filterChipActive]}><Text style={[styles.filterChipText, status === item && styles.filterChipTextActive]}>{item}</Text></Pressable>)}</View>{search || status !== 'All' ? <SecondaryButton label="Clear filters" onPress={() => { setSearch(''); setStatus('All'); }} /> : null}</Card>
    <Card>{leads.map(lead => <Pressable key={lead.id} style={styles.row} onPress={() => router.push(`/lead/${lead.id}`)}><ViewBody lead={lead} /></Pressable>)}{!leads.length ? <Text style={styles.copy}>No leads match the selected filters.</Text> : null}</Card>
  </Screen>;
}

function ViewBody({ lead }: { lead: Lead }) { return <View style={styles.rowBody}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={styles.rowTitle}>{lead.full_name}</Text><Text style={styles.badge}>{lead.status || 'New'}</Text></View><Text style={styles.rowMeta}>{`${lead.interested_in || 'Requirement pending'} · ${lead.assigned_agent || 'Unassigned'}`}</Text><Text style={styles.rowMeta}>{lead.phone || lead.email || 'No contact details'}</Text></View>; }
