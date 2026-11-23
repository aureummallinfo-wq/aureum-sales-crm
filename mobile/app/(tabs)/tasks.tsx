import { useState } from 'react';
import { router } from 'expo-router';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, DateRangeControls, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';
import { ApiList, Task } from '@/types/api';
import { dateRangeBounds, dateRangeReady, DateRangeValue } from '@/lib/date-range';

const filters = ['All', 'Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'];

export default function TasksScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueAt, setDueAt] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState('');
  const [filter, setFilter] = useState('All');
  const [dateRange, setDateRange] = useState<DateRangeValue>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const canCreate = ['super_admin', 'sales_manager'].includes(String(user?.role || '').toLowerCase());
  const bounds = dateRangeBounds(dateRange, appliedStart, appliedEnd);
  const rangeReady = dateRangeReady(dateRange, appliedStart, appliedEnd);
  const agentsQuery = useQuery({
    queryKey: ['task-agents', user?.id],
    queryFn: ({ signal }) => apiFetch<{ data: Array<{ id: string; full_name?: string; fullName?: string; name?: string }> }>('/api/agents', { signal }),
    enabled: Boolean(user) && canCreate
  });
  const query = useInfiniteQuery({
    queryKey: ['tasks', user?.id, filter, dateRange, appliedStart, appliedEnd],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => { const params = new URLSearchParams({ page: String(pageParam), pageSize: '25' }); if (filter !== 'All') params.set('status', filter); if (bounds) { params.set('dateFrom', bounds.start); params.set('dateTo', bounds.end); } return apiFetch<ApiList<Task>>(`/api/tasks?${params.toString()}`, { signal }); },
    getNextPageParam: lastPage => lastPage.meta?.hasNextPage ? (lastPage.meta.page || 1) + 1 : undefined,
    placeholderData: keepPreviousData,
    enabled: Boolean(user) && rangeReady
  });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Tasks could not load." onRetry={() => { void query.refetch(); }} /></Screen>;
  const items = query.data?.pages.flatMap(page => page.data) || [];

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

  async function createTask() {
    if (!title.trim()) { Alert.alert('Task title required', 'Enter a title before creating the task.'); return; }
    try { await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title: title.trim(), description: description.trim(), priority, due_at: dueAt.trim() || undefined, assigned_agent_id: assignedAgentId || undefined }) }); setTitle(''); setDescription(''); setPriority('Medium'); setDueAt(''); setAssignedAgentId(''); setShowCreate(false); await Promise.all([queryClient.invalidateQueries({ queryKey: ['tasks'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); Alert.alert('Task created', 'The task was added to the CRM work queue.'); }
    catch (error) { Alert.alert('Unable to create task', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function updateStatus(id: string, status: string) {
    try { await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ['tasks'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); }
    catch (error) { Alert.alert('Unable to update task', error instanceof Error ? error.message : 'Please try again.'); }
  }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}><PageTitle eyebrow="Work queue" title="Tasks" copy="See the next operational action." />{canCreate ? <PrimaryButton label={showCreate ? 'Close task form' : '＋ Create task'} onPress={() => setShowCreate(value => !value)} /> : null}{showCreate ? <Card><Text style={styles.rowTitle}>Create task</Text><TextInput value={title} onChangeText={setTitle} placeholder="Task title" placeholderTextColor={colors.muted} style={styles.input} /><TextInput multiline value={description} onChangeText={setDescription} placeholder="Task details" placeholderTextColor={colors.muted} style={styles.noteInput} /><TextInput value={dueAt} onChangeText={setDueAt} placeholder="Due date/time · 2026-11-12T14:00" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>Assign to</Text><View style={styles.filterRow}><SecondaryButton label="Myself" active={!assignedAgentId} onPress={() => setAssignedAgentId('')} />{(agentsQuery.data?.data || []).map(agent => { const label = agent.full_name || agent.fullName || agent.name || 'Advisor'; return <SecondaryButton key={agent.id} label={label} active={assignedAgentId === agent.id} onPress={() => setAssignedAgentId(agent.id)} />; })}</View><Text style={styles.label}>Priority</Text><View style={styles.filterRow}>{['Low', 'Medium', 'High', 'Urgent'].map(item => <SecondaryButton key={item} label={item} active={priority === item} onPress={() => setPriority(item)} />)}</View><PrimaryButton label="Save task" onPress={() => { void createTask(); }} /></Card> : null}<DateRangeControls value={dateRange} customStart={customStart} customEnd={customEnd} onChange={updateDateRange} onApply={applyCustomRange} applyDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)} /><View style={styles.filterRow}>{filters.map(item => <SecondaryButton active={filter === item} key={item} label={item} onPress={() => setFilter(item)} />)}</View>{!rangeReady ? <Card><Text style={styles.copy}>Apply both custom dates to load this view.</Text></Card> : <Card>{items.map(item => <TaskRow key={item.id} item={item} onStatus={(status) => { void updateStatus(item.id, status); }} />)}{!items.length ? <Text style={styles.copy}>No tasks in this view.</Text> : null}{query.hasNextPage ? <SecondaryButton label={query.isFetchingNextPage ? 'Loading…' : 'Load more tasks'} onPress={() => { void query.fetchNextPage(); }} disabled={query.isFetchingNextPage} /> : null}</Card>}</Screen>;
}

function TaskRow({ item, onStatus }: { item: Task; onStatus: (status: string) => void }) {
  const completed = String(item.status || '').toLowerCase() === 'completed';
  return <View style={styles.row}><Pressable accessibilityRole="button" onPress={() => router.push(`/task/${item.id}`)} style={styles.rowBody}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{`${item.status || 'Pending'}${item.dueAt ? ` · ${item.dueAt}` : ''}`}</Text>{item.description ? <Text style={styles.rowMeta} numberOfLines={2}>{item.description}</Text> : null}</Pressable><SecondaryButton label={completed ? 'Reopen' : 'Complete'} onPress={() => onStatus(completed ? 'Pending' : 'Completed')} /></View>;
}
