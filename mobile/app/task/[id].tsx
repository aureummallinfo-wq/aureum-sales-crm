import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { Task } from '@/types/api';
import { colors } from '@/theme';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ['task', id], queryFn: () => apiFetch<{ data: Task }>(`/api/tasks/${encodeURIComponent(String(id))}`), enabled: Boolean(id) });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data?.data) return <Screen><ErrorState message="This task could not be opened." /></Screen>;

  const task = query.data.data;
  const currentDescription = description ?? task.description ?? '';
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

  return <Screen>
    <BackButton label="Back to tasks" />
    <PageTitle eyebrow="Work queue" title={task.title} copy={`${task.status || 'Pending'} · ${task.priority || 'Normal priority'}`} />
    <Card><Text style={styles.rowMeta}>Due</Text><Text style={styles.rowTitle}>{task.dueAt || 'No due date'}</Text><Text style={styles.rowMeta}>Assigned to</Text><Text style={styles.rowTitle}>{task.assignedAgent || 'Unassigned'}</Text>{task.customerName ? <><Text style={styles.rowMeta}>Customer</Text><Text style={styles.rowTitle}>{task.customerName}</Text></> : null}{task.leadName ? <><Text style={styles.rowMeta}>Lead</Text><Text style={styles.rowTitle}>{task.leadName}</Text></> : null}</Card>
    <Card><Text style={styles.rowTitle}>Task context</Text><TextInput multiline value={currentDescription} onChangeText={setDescription} placeholder="Add useful context for the next action…" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={saving ? 'Saving…' : 'Save context'} onPress={() => { void updateTask({ description: currentDescription }); }} disabled={saving} /></Card>
    <Card><Text style={styles.rowTitle}>Status</Text><Text style={styles.copy}>{completed ? 'This task is complete.' : 'Keep the task open until the next action is finished.'}</Text><SecondaryButton label={completed ? 'Reopen task' : 'Mark complete'} onPress={() => { void updateTask({ status: completed ? 'Pending' : 'Completed' }); }} disabled={saving} /></Card>
  </Screen>;
}
