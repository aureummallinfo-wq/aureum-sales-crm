import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingState, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';
import { ApiList, Customer } from '@/types/api';

const statusFilters = ['All', 'New', 'Hot', 'Follow-up', 'Closed Won'];

export default function CustomersScreen() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const basePath = user?.role === 'sales_agent' ? '/api/customers/my' : '/api/customers';
  const params = new URLSearchParams({ page: '1', pageSize: '25' });
  if (search.trim()) params.set('q', search.trim());
  if (status !== 'All') params.set('status', status);
  const endpoint = `${basePath}?${params.toString()}`;
  const query = useQuery({ queryKey: ['customers', user?.role, search, status], queryFn: () => apiFetch<ApiList<Customer>>(endpoint), enabled: Boolean(user) });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="The customer registry could not load." /></Screen>;
  const customers = query.data?.data || [];

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Relationships" title="Customers" copy={`${query.data?.meta?.total ?? customers.length} permitted records`} />
    <Card>
      <TextInput autoCapitalize="none" value={search} onChangeText={setSearch} placeholder="Search name, phone, email…" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.filterRow}>{statusFilters.map(item => <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filterChip, status === item && styles.filterChipActive]}><Text style={[styles.filterChipText, status === item && styles.filterChipTextActive]}>{item}</Text></Pressable>)}</View>
      {search || status !== 'All' ? <SecondaryButton label="Clear filters" onPress={() => { setSearch(''); setStatus('All'); }} /> : null}
    </Card>
    <Card>
      {customers.map(customer => <Pressable key={customer.id} style={styles.row} onPress={() => router.push(`/customer/${customer.id}`)}><View style={styles.rowBody}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={styles.rowTitle}>{customer.full_name}</Text><Text style={styles.badge}>{customer.customer_status || customer.status || 'New'}</Text></View><Text style={styles.rowMeta}>{`${customer.interested_in || 'Requirement pending'} · ${customer.assigned_agent || 'Unassigned'}`}</Text><Text style={styles.rowMeta}>{customer.phone || customer.email || 'No contact details'}</Text></View></Pressable>)}
      {!customers.length ? <Text style={styles.copy}>No customers match the selected filters.</Text> : null}
    </Card>
  </Screen>;
}
