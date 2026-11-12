import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, Text, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { Card, ErrorState, LoadingState, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { ApiList, Task } from '@/types/api';

const filters = ['All', 'Pending', 'In Progress', 'Completed'];

export default function TasksScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const query = useQuery({ queryKey: ['tasks'], queryFn: () => apiFetch<ApiList<Task>>('/api/tasks?page=1&pageSize=25') });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Tasks could not load." /></Screen>;
  const allItems = query.data?.data || [];
  const items = filter === 'All' ? allItems : allItems.filter(item => String(item.status || '').toLowerCase() === filter.toLowerCase());

  async function updateStatus(id: string, status: string) {
    try { await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await queryClient.invalidateQueries({ queryKey: ['tasks'] }); }
    catch (error) { Alert.alert('Unable to update task', error instanceof Error ? error.message : 'Please try again.'); }
  }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}><PageTitle eyebrow="Work queue" title="Tasks" copy="See the next operational action." /><View style={styles.filterRow}>{filters.map(item => <SecondaryButton key={item} label={item} onPress={() => setFilter(item)} />)}</View><Card>{items.map(item => <TaskRow key={item.id} item={item} onStatus={(status) => { void updateStatus(item.id, status); }} />)}{!items.length ? <Text style={styles.copy}>No tasks in this view.</Text> : null}</Card></Screen>;
}

function TaskRow({ item, onStatus }: { item: Task; onStatus: (status: string) => void }) {
  const completed = String(item.status || '').toLowerCase() === 'completed';
  return <View style={styles.row}><Pressable accessibilityRole="button" onPress={() => router.push(`/task/${item.id}`)} style={styles.rowBody}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{`${item.status || 'Pending'}${item.dueAt ? ` · ${item.dueAt}` : ''}`}</Text>{item.description ? <Text style={styles.rowMeta} numberOfLines={2}>{item.description}</Text> : null}</Pressable><SecondaryButton label={completed ? 'Reopen' : 'Complete'} onPress={() => onStatus(completed ? 'Pending' : 'Completed')} /></View>;
}
