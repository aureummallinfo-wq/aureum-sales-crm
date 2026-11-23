import { useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/auth/session';
import { apiFetch } from '@/api/client';
import { Card, DateRangeControls, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { ApiList, Customer, FollowUp } from '@/types/api';
import { colors } from '@/theme';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { dateRangeBounds, dateRangeReady, DateRangeValue } from '@/lib/date-range';

const statusFilters = ['All', 'Pending', 'Contacted', 'Overdue', 'Completed', 'Missed', 'Rescheduled', 'Cancelled'];
const followUpTypes = ['All types', 'Phone call', 'WhatsApp', 'Email', 'Payment Plan Follow-up', 'Booking Follow-up', 'Site Visit Reminder', 'General Follow-up'];
const priorities = ['All priorities', 'Low', 'Medium', 'High', 'VIP'];
type ViewMode = 'list' | 'calendar';

function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function monthLabel(value: Date) { return value.toLocaleDateString([], { month: 'long', year: 'numeric' }); }
function monthBounds(value: Date) { return { start: dateKey(new Date(value.getFullYear(), value.getMonth(), 1)), end: dateKey(new Date(value.getFullYear(), value.getMonth() + 1, 0)) }; }

export default function FollowUpsScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [agentId, setAgentId] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [dateRange, setDateRange] = useState<DateRangeValue>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [newType, setNewType] = useState('Phone call');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newDueDate, setNewDueDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [newDueTime, setNewDueTime] = useState('10:00');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const role = String(user?.role || '').toLowerCase();
  const canFilterAgents = ['super_admin', 'sales_manager'].includes(role);
  const basePath = role === 'sales_agent' ? '/api/follow-ups/my' : '/api/follow-ups';
  const bounds = monthBounds(monthCursor);
  const serverBounds = dateRangeBounds(dateRange, appliedStart, appliedEnd);
  const rangeReady = dateRangeReady(dateRange, appliedStart, appliedEnd);
  const agentsQuery = useQuery({ queryKey: ['follow-up-agents', role], queryFn: ({ signal }) => apiFetch<{ data: Array<{ id: string; full_name?: string; name?: string }> }>('/api/agents', { signal }), enabled: Boolean(user) && canFilterAgents });
  const customersQuery = useQuery({
    queryKey: ['follow-up-create-customers', user?.id, role],
    queryFn: ({ signal }) => apiFetch<ApiList<Customer>>(`${role === 'sales_agent' ? '/api/customers/my' : '/api/customers'}?page=1&pageSize=100`, { signal }),
    enabled: Boolean(user) && showCreate
  });
  const query = useInfiniteQuery({
    queryKey: ['follow-ups', user?.id, user?.role, filter, debouncedSearch, type, priority, agentId, viewMode, bounds.start, bounds.end, dateRange, appliedStart, appliedEnd],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: '25' });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (filter !== 'All') params.set('status', filter);
      if (type) params.set('type', type);
      if (priority) params.set('priority', priority);
      if (agentId) params.set('agentId', agentId);
      if (viewMode === 'calendar') { params.set('customStart', bounds.start); params.set('customEnd', bounds.end); }
      else if (dateRange === 'custom' && serverBounds) { params.set('customStart', serverBounds.start); params.set('customEnd', serverBounds.end); }
      else if (dateRange !== 'all') params.set('date', dateRange);
      return apiFetch<ApiList<FollowUp>>(`${basePath}?${params.toString()}`, { signal });
    },
    getNextPageParam: lastPage => lastPage.meta?.hasNextPage ? (lastPage.meta.page || 1) + 1 : undefined,
    placeholderData: keepPreviousData,
    enabled: Boolean(user) && rangeReady
  });
  const calendarDays = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    return Array.from({ length: first.getDay() + last.getDate() }, (_, index) => index < first.getDay() ? null : new Date(monthCursor.getFullYear(), monthCursor.getMonth(), index - first.getDay() + 1));
  }, [monthCursor]);
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Follow-ups could not load." onRetry={() => { void query.refetch(); }} /></Screen>;
  const items = query.data?.pages.flatMap(page => page.data) || [];

  async function updateStatus(id: string, action: 'complete' | 'missed' | 'cancel') {
    try { await apiFetch(`/api/follow-ups/${encodeURIComponent(id)}/${action}`, { method: 'PATCH', body: JSON.stringify(action === 'complete' ? { completion_note: 'Completed from mobile CRM' } : {}) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ['follow-ups'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); }
    catch (error) { Alert.alert('Unable to update follow-up', error instanceof Error ? error.message : 'Please try again.'); }
  }
  async function createFollowUp() {
    if (!customerId || !/^\d{4}-\d{2}-\d{2}$/.test(newDueDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newDueTime)) { Alert.alert('Check follow-up details', 'Choose a customer and use YYYY-MM-DD and HH:MM.'); return; }
    setCreating(true);
    try {
      await apiFetch('/api/follow-ups', { method: 'POST', body: JSON.stringify({ customer_id: customerId, follow_up_type: newType, due_date: newDueDate, due_time: newDueTime, priority: newPriority, notes: newNote.trim() }) });
      setShowCreate(false); setCustomerId(''); setNewNote('');
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['follow-ups'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]);
      Alert.alert('Follow-up scheduled', 'The new customer commitment is now in the CRM schedule.');
    } catch (error) { Alert.alert('Unable to schedule follow-up', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setCreating(false); }
  }
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
  function clearFilters() { setSearch(''); setFilter('All'); setType(''); setPriority(''); setAgentId(''); updateDateRange({ value: 'all' }); }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Daily rhythm" title="Follow-ups" copy="Protect every customer commitment." />
    <SecondaryButton label={showCreate ? 'Close new follow-up' : '＋ New customer follow-up'} onPress={() => setShowCreate(value => !value)} />
    {showCreate ? <Card><Text style={styles.rowTitle}>Schedule a follow-up</Text><Text style={styles.rowMeta}>Customer</Text><View style={styles.filterRow}>{(customersQuery.data?.data || []).slice(0, 40).map(customer => <SecondaryButton key={customer.id} label={customer.full_name} active={customerId === customer.id} onPress={() => setCustomerId(customer.id)} />)}</View>{customersQuery.isLoading ? <Text style={styles.copy}>Loading permitted customers…</Text> : null}{customersQuery.isError ? <Text style={styles.error}>Customers could not load. Close and reopen this form to retry.</Text> : null}<TextInput value={newType} onChangeText={setNewType} placeholder="Follow-up type" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.filterRow}>{['Low', 'Medium', 'High', 'VIP'].map(item => <SecondaryButton key={item} label={item} active={newPriority === item} onPress={() => setNewPriority(item)} />)}</View><TextInput value={newDueDate} onChangeText={setNewDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={newDueTime} onChangeText={setNewDueTime} placeholder="HH:MM" placeholderTextColor={colors.muted} style={styles.input} /><TextInput multiline value={newNote} onChangeText={setNewNote} placeholder="What should happen next?" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={creating ? 'Scheduling…' : 'Schedule follow-up'} onPress={() => { void createFollowUp(); }} disabled={creating || !customerId} /></Card> : null}
    <DateRangeControls value={dateRange} customStart={customStart} customEnd={customEnd} onChange={updateDateRange} onApply={applyCustomRange} applyDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)} />
    <Card>
      <TextInput autoCapitalize="none" value={search} onChangeText={setSearch} placeholder="Search customer, phone, note…" placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.rowMeta}>Type</Text><View style={styles.filterRow}>{followUpTypes.map(item => { const value = item === 'All types' ? '' : item; return <SecondaryButton key={item} label={item} active={type === value} onPress={() => setType(value)} />; })}</View>
      <Text style={styles.rowMeta}>Priority</Text><View style={styles.filterRow}>{priorities.map(item => { const value = item === 'All priorities' ? '' : item; return <SecondaryButton key={item} label={item} active={priority === value} onPress={() => setPriority(value)} />; })}</View>
      {canFilterAgents ? <><Text style={styles.rowMeta}>Advisor</Text><View style={styles.filterRow}><SecondaryButton label="All advisors" active={!agentId} onPress={() => setAgentId('')} />{(agentsQuery.data?.data || []).map(agent => <SecondaryButton key={agent.id} label={agent.full_name || agent.name || 'Advisor'} active={agentId === agent.id} onPress={() => setAgentId(agent.id)} />)}</View></> : null}
      {search || filter !== 'All' || type || priority || agentId || dateRange !== 'all' ? <SecondaryButton label="Clear filters" onPress={clearFilters} /> : null}
    </Card>
    <View style={styles.filterRow}><SecondaryButton label="List" active={viewMode === 'list'} onPress={() => setViewMode('list')} /><SecondaryButton label="Calendar" active={viewMode === 'calendar'} onPress={() => setViewMode('calendar')} /></View>
    <View style={styles.filterRow}>{statusFilters.map(item => <SecondaryButton active={filter === item} key={item} label={item} onPress={() => setFilter(item)} />)}</View>
    {!rangeReady ? <Card><Text style={styles.copy}>Apply both custom dates to load this view.</Text></Card> : viewMode === 'calendar' ? <Card>
      <View style={styles.sectionHeader}><SecondaryButton label="‹" onPress={() => setMonthCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} /><Text style={styles.rowTitle}>{monthLabel(monthCursor)}</Text><SecondaryButton label="›" onPress={() => setMonthCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} /></View>
      <SecondaryButton label="Today" onPress={() => setMonthCursor(new Date())} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={{ width: '14.28%', textAlign: 'center', color: colors.muted, fontSize: 12, paddingVertical: 6 }}>{day}</Text>)}{calendarDays.map((day, index) => { const key = day ? dateKey(day) : `empty-${index}`; const dayItems = day ? items.filter(item => item.due_date === key) : []; return <View key={key} style={{ width: '14.28%', minHeight: 68, borderWidth: 1, borderColor: colors.border, padding: 5, backgroundColor: dayItems.length ? colors.goldPale : colors.surface }}>{day ? <Text style={styles.rowMeta}>{day.getDate()}</Text> : null}{dayItems.slice(0, 2).map(item => <Text key={item.id} numberOfLines={1} style={{ fontSize: 10, color: colors.text }}>{item.customer_name || 'Customer'}</Text>)}{dayItems.length > 2 ? <Text style={{ fontSize: 10, color: colors.muted }}>+{dayItems.length - 2} more</Text> : null}</View>; })}</View>
      {!items.length ? <Text style={styles.copy}>No follow-ups are scheduled in this month.</Text> : null}
    </Card> : <Card>{items.map(item => <FollowUpRow key={item.id} item={item} onAction={(action) => { void updateStatus(item.id, action); }} />)}{!items.length ? <Text style={styles.copy}>No follow-ups in this view.</Text> : null}{query.hasNextPage ? <SecondaryButton label={query.isFetchingNextPage ? 'Loading…' : 'Load more follow-ups'} onPress={() => { void query.fetchNextPage(); }} disabled={query.isFetchingNextPage} /> : null}</Card>}
  </Screen>;
}

function FollowUpRow({ item, onAction }: { item: FollowUp; onAction: (action: 'complete' | 'missed' | 'cancel') => void }) {
  const closed = ['completed', 'cancelled', 'missed'].includes(String(item.status || '').toLowerCase());
  return <View style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle} onPress={() => router.push(`/follow-up/${item.id}`)}>{item.customer_name || 'Customer'}</Text><Text style={styles.rowMeta}>{`${item.due_date || 'No date'}${item.due_time ? ` · ${item.due_time}` : ''}`}</Text><Text style={styles.rowMeta}>{item.follow_up_type || 'General follow-up'} · {item.status || 'Pending'}</Text><Text style={styles.linkText} onPress={() => router.push(`/follow-up/${item.id}`)}>Open details</Text></View>{!closed ? <View style={styles.actionStack}><SecondaryButton label="Complete" onPress={() => onAction('complete')} /><SecondaryButton label="Missed" onPress={() => onAction('missed')} /><SecondaryButton label="Cancel" onPress={() => onAction('cancel')} /></View> : null}</View>;
}
