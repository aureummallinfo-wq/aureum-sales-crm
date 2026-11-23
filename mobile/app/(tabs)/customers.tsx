import { useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, DateRangeControls, ErrorState, LoadingState, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';
import { ApiList, Customer } from '@/types/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { dateRangeBounds, dateRangeReady, DateRangeValue } from '@/lib/date-range';

const statusFilters = ['All', 'New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'];

export default function CustomersScreen() {
  const { user } = useSession();
  const canViewCustomers = ['super_admin', 'sales_manager', 'sales_agent'].includes(String(user?.role || '').toLowerCase());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const basePath = user?.role === 'sales_agent' ? '/api/customers/my' : '/api/customers';
  const bounds = dateRangeBounds(dateRange, appliedStart, appliedEnd);
  const rangeReady = dateRangeReady(dateRange, appliedStart, appliedEnd);
  const query = useInfiniteQuery({
    queryKey: ['customers', user?.id, user?.role, debouncedSearch, status, dateRange, appliedStart, appliedEnd],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: '25' });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (status !== 'All') params.set('status', status);
      if (bounds) { params.set('dateFrom', bounds.start); params.set('dateTo', bounds.end); }
      return apiFetch<ApiList<Customer>>(`${basePath}?${params.toString()}`, { signal });
    },
    getNextPageParam: lastPage => lastPage.meta?.hasNextPage ? (lastPage.meta.page || 1) + 1 : undefined,
    placeholderData: keepPreviousData,
    enabled: Boolean(user) && canViewCustomers && rangeReady
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="The customer registry could not load." onRetry={() => { void query.refetch(); }} /></Screen>;
  const customers = query.data?.pages.flatMap(page => page.data) || [];
  const total = query.data?.pages[0]?.meta?.total ?? customers.length;

  if (!canViewCustomers) return <Screen><ErrorState message="Customers are not available for this CRM role." /></Screen>;

  function updateDateRange(next: { value?: DateRangeValue; customStart?: string; customEnd?: string }) {
    if (next.value) { setDateRange(next.value); setAppliedStart(''); setAppliedEnd(''); }
    if (next.customStart !== undefined) setCustomStart(next.customStart);
    if (next.customEnd !== undefined) setCustomEnd(next.customEnd);
  }
  function applyCustomRange() {
    const next = dateRangeBounds('custom', customStart, customEnd);
    if (!next) { Alert.alert('Check dates', 'Enter valid start and end dates in YYYY-MM-DD format.'); return; }
    setAppliedStart(next.start); setAppliedEnd(next.end);
  }

  async function exportCustomers() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (status !== 'All') params.set('status', status);
      if (bounds) { params.set('dateFrom', bounds.start); params.set('dateTo', bounds.end); }
      const result = await apiFetch<{ data: Customer[] }>(`${basePath}${params.toString() ? `?${params.toString()}` : ''}`);
      const escape = (value: unknown) => { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
      const rows = [['Name', 'Phone', 'Email', 'Interested In', 'Assigned Agent', 'Status', 'Next Follow-up'], ...(result.data || []).map(customer => [customer.full_name, customer.phone, customer.email, customer.interested_in, customer.assigned_agent, customer.customer_status || customer.status, customer.next_follow_up_at])];
      const csv = rows.map(row => row.map(escape).join(',')).join('\n');
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error('Temporary file storage is unavailable on this device.');
      const fileUri = `${directory}aureum-customers.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Aureum customers' });
    } catch (error) { Alert.alert('Export failed', error instanceof Error ? error.message : 'Customers could not be exported.'); }
    finally { setExporting(false); }
  }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Relationships" title="Customers" copy={`${total} permitted records`} />
    <SecondaryButton label={exporting ? 'Preparing CSV…' : 'Export customers (CSV)'} onPress={() => { void exportCustomers(); }} disabled={exporting || !rangeReady} />
    <DateRangeControls value={dateRange} customStart={customStart} customEnd={customEnd} onChange={updateDateRange} onApply={applyCustomRange} applyDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)} />
    <Card>
      <TextInput autoCapitalize="none" value={search} onChangeText={setSearch} placeholder="Search name, phone, email…" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.filterRow}>{statusFilters.map(item => <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filterChip, status === item && styles.filterChipActive]}><Text style={[styles.filterChipText, status === item && styles.filterChipTextActive]}>{item}</Text></Pressable>)}</View>
      {search || status !== 'All' || dateRange !== 'all' ? <SecondaryButton label="Clear filters" onPress={() => { setSearch(''); setStatus('All'); updateDateRange({ value: 'all' }); }} /> : null}
    </Card>
    {!rangeReady ? <Card><Text style={styles.copy}>Apply both custom dates to load this view.</Text></Card> : <Card>
      {customers.map(customer => <Pressable key={customer.id} style={styles.row} onPress={() => router.push(`/customer/${customer.id}`)}><View style={styles.rowBody}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={styles.rowTitle}>{customer.full_name}</Text><Text style={styles.badge}>{customer.customer_status || customer.status || 'New'}</Text></View><Text style={styles.rowMeta}>{`${customer.interested_in || 'Requirement pending'} · ${customer.assigned_agent || 'Unassigned'}`}</Text><Text style={styles.rowMeta}>{customer.phone || customer.email || 'No contact details'}</Text></View></Pressable>)}
      {!customers.length ? <Text style={styles.copy}>No customers match the selected filters.</Text> : null}
      {query.hasNextPage ? <SecondaryButton label={query.isFetchingNextPage ? 'Loading…' : 'Load more customers'} onPress={() => { void query.fetchNextPage(); }} disabled={query.isFetchingNextPage} /> : null}
    </Card>}
  </Screen>;
}
