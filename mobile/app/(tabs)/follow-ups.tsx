import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/auth/session';
import { apiFetch } from '@/api/client';
import { Card, ErrorState, LoadingState, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { ApiList, FollowUp } from '@/types/api';

const filters = ['All', 'Pending', 'Overdue', 'Completed'];

export default function FollowUpsScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const endpoint = user?.role === 'sales_agent' ? '/api/follow-ups/my' : '/api/follow-ups';
  const query = useQuery({ queryKey: ['follow-ups', user?.role], queryFn: () => apiFetch<ApiList<FollowUp>>(endpoint), enabled: Boolean(user) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Follow-ups could not load." /></Screen>;
  const allItems = query.data?.data || [];
  const items = filter === 'All' ? allItems : allItems.filter(item => String(item.status || '').toLowerCase() === filter.toLowerCase());

  async function updateStatus(id: string, action: 'complete' | 'missed' | 'cancel') {
    try { await apiFetch(`/api/follow-ups/${encodeURIComponent(id)}/${action}`, { method: 'PATCH', body: JSON.stringify(action === 'complete' ? { completion_note: 'Completed from mobile CRM' } : {}) }); await queryClient.invalidateQueries({ queryKey: ['follow-ups', user?.role] }); }
    catch (error) { Alert.alert('Unable to update follow-up', error instanceof Error ? error.message : 'Please try again.'); }
  }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}><PageTitle eyebrow="Daily rhythm" title="Follow-ups" copy="Protect every customer commitment." /><View style={styles.filterRow}>{filters.map(item => <SecondaryButton key={item} label={item} onPress={() => setFilter(item)} />)}</View><Card>{items.slice(0, 30).map(item => <FollowUpRow key={item.id} item={item} onAction={(action) => { void updateStatus(item.id, action); }} />)}{!items.length ? <Text style={styles.copy}>No follow-ups in this view.</Text> : null}</Card></Screen>;
}

function FollowUpRow({ item, onAction }: { item: FollowUp; onAction: (action: 'complete' | 'missed' | 'cancel') => void }) {
  const closed = ['Completed', 'Cancelled', 'Missed'].includes(String(item.status || ''));
  return <View style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle} onPress={() => router.push(`/follow-up/${item.id}`)}>{item.customer_name || 'Customer'}</Text><Text style={styles.rowMeta}>{`${item.due_date || 'No date'}${item.due_time ? ` · ${item.due_time}` : ''}`}</Text><Text style={styles.rowMeta}>{item.follow_up_type || 'General follow-up'} · {item.status || 'Pending'}</Text><Text style={styles.linkText} onPress={() => router.push(`/follow-up/${item.id}`)}>Open details</Text></View>{!closed ? <View style={styles.actionStack}><SecondaryButton label="Complete" onPress={() => onAction('complete')} /><SecondaryButton label="Missed" onPress={() => onAction('missed')} /></View> : null}</View>;
}
