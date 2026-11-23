import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { BackButton, Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { Task } from '@/types/api';
import { colors } from '@/theme';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = ['super_admin', 'sales_manager'].includes(String(user?.role || '').toLowerCase());
  const agentsQuery = useQuery({
    queryKey: ['task-detail-agents', user?.id],
    queryFn: ({ signal }) => apiFetch<{ data: Array<{ id: string; full_name?: string; fullName?: string; name?: string }> }>('/api/agents', { signal }),
    enabled: Boolean(user) && canManage
  });
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ['task', id], queryFn: ({ signal }) => apiFetch<{ data: Task }>(`/api/tasks/${encodeURIComponent(String(id))}`, { signal }), enabled: Boolean(id) });
  const task = query.data?.data;

  useEffect(() => {
    if (!task) return;
    if (title === null) setTitle(task.title);
    if (description === null) setDescription(task.description || '');
    if (priority === null) setPriority(task.priority || 'Medium');
    if (dueAt === null) setDueAt(task.dueAt || task.due_at || '');
    if (assignedAgentId === null) setAssignedAgentId(task.assignedAgentId || task.assignedTo || user?.id || '');
  }, [assignedAgentId, description, dueAt, priority, task, title, user?.id]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !task) return <Screen><ErrorState message="This task could not be opened." onRetry={query.isError ? () => { void query.refetch(); } : undefined} /></Screen>;

  const currentTitle = title ?? task.title;
  const currentDescription = description ?? task.description ?? '';
  const currentPriority = priority ?? task.priority ?? 'Medium';
  const currentDueAt = dueAt ?? task.dueAt ?? task.due_at ?? '';
  const completed = String(task.status || '').toLowerCase() === 'completed';

  async function updateTask(patch: Record<string, string>) {
    if (!id) return;
    setSaving(true);
    try {
      await apiFetch(`/api/tasks/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setDescription(null);
      await queryClient.invalidateQueries({ queryKey: ['task', id] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      Alert.alert('Task updated', 'The task was updated in the CRM.');
    } catch (error) {
      Alert.alert('Unable to update task', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() { if (!id) return; Alert.alert('Delete task', `Delete “${currentTitle}”? This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void (async () => { try { await apiFetch(`/api/tasks/${encodeURIComponent(String(id))}`, { method: 'DELETE' }); await queryClient.invalidateQueries({ queryKey: ['tasks'] }); router.back(); } catch (error) { Alert.alert('Unable to delete task', error instanceof Error ? error.message : 'Please try again.'); } })(); } }]); }

  return <Screen>
    <BackButton label="Back to tasks" />
    <PageTitle eyebrow="Work queue" title={currentTitle} copy={`${task.status || 'Pending'} · ${currentPriority || 'Normal priority'}`} />
    <Card><Text style={styles.rowMeta}>Due</Text><Text style={styles.rowTitle}>{currentDueAt || 'No due date'}</Text><Text style={styles.rowMeta}>Assigned to</Text><Text style={styles.rowTitle}>{task.assignedAgent || 'Unassigned'}</Text>{task.customerName ? <><Text style={styles.rowMeta}>Customer</Text><Text style={styles.rowTitle}>{task.customerName}</Text></> : null}{task.leadName ? <><Text style={styles.rowMeta}>Lead</Text><Text style={styles.rowTitle}>{task.leadName}</Text></> : null}</Card>
    <Card><Text style={styles.rowTitle}>Task details</Text><TextInput value={currentTitle} onChangeText={setTitle} placeholder="Task title" placeholderTextColor={colors.muted} style={styles.input} /><TextInput multiline value={currentDescription} onChangeText={setDescription} placeholder="Add useful context for the next action…" placeholderTextColor={colors.muted} style={styles.noteInput} /><TextInput value={currentDueAt} onChangeText={setDueAt} placeholder="Due date/time" placeholderTextColor={colors.muted} style={styles.input} />{canManage ? <><Text style={styles.label}>Assign to</Text><View style={styles.filterRow}>{(agentsQuery.data?.data || []).map(agent => { const label = agent.full_name || agent.fullName || agent.name || 'Advisor'; return <SecondaryButton key={agent.id} label={label} active={assignedAgentId === agent.id} onPress={() => setAssignedAgentId(agent.id)} />; })}</View></> : null}<Text style={styles.label}>Priority</Text><View style={styles.filterRow}>{['Low', 'Medium', 'High', 'Urgent'].map(item => <SecondaryButton key={item} label={item} active={currentPriority === item} onPress={() => setPriority(item)} />)}</View><PrimaryButton label={saving ? 'Saving…' : 'Save task details'} onPress={() => { void updateTask({ title: currentTitle, description: currentDescription, priority: currentPriority, due_at: currentDueAt, ...(canManage && assignedAgentId ? { assigned_agent_id: assignedAgentId } : {}) }); }} disabled={saving || !currentTitle.trim()} /></Card>
    <Card><Text style={styles.rowTitle}>Status</Text><Text style={styles.copy}>{completed ? 'This task is complete.' : 'Keep the task open until the next action is finished.'}</Text><SecondaryButton label={completed ? 'Reopen task' : 'Mark complete'} onPress={() => { void updateTask({ status: completed ? 'Pending' : 'Completed' }); }} disabled={saving} /></Card>
    {canManage ? <Card><Text style={styles.rowTitle}>Danger zone</Text><SecondaryButton label="Delete task" onPress={confirmDelete} disabled={saving} /></Card> : null}
  </Screen>;
}
