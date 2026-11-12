import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api/client';
import { Card, ErrorState, LoadingState, PageTitle, Screen, SecondaryButton, styles } from '@/components/ui';
import { NotificationItem } from '@/types/api';
import { queryClient } from '@/lib/query-client';

function routeFor(item: NotificationItem) {
  if (!item.related_entity_id) return null;
  if (item.related_entity_type === 'lead') return `/lead/${item.related_entity_id}`;
  if (item.related_entity_type === 'customer') return `/customer/${item.related_entity_id}`;
  if (item.related_entity_type === 'follow_up') return `/follow-up/${item.related_entity_id}`;
  if (item.related_entity_type === 'task') return '/(tabs)/tasks';
  return null;
}

export default function NotificationsScreen() {
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => apiFetch<{ data: NotificationItem[]; unread?: number }>('/api/notifications') });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Notifications could not load." /></Screen>;
  const items = query.data?.data || [];
  async function markAllRead() {
    await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }
  async function openNotification(item: NotificationItem) {
    if (!item.is_read) { await apiFetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PATCH' }); await queryClient.invalidateQueries({ queryKey: ['notifications'] }); }
    const route = routeFor(item);
    if (route) router.push(route as never);
  }
  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Workspace" title="Notifications" copy={`${query.data?.unread || 0} unread updates`} />
    {items.length ? <SecondaryButton label="Mark all as read" onPress={() => { void markAllRead(); }} /> : null}
    <Card>{items.map(item => <Pressable key={item.id} onPress={() => { void openNotification(item); }} style={[styles.row, !item.is_read && styles.notificationUnread]}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{item.message || 'New CRM update'}</Text><Text style={styles.rowMeta}>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Recent'}</Text></View>{!item.is_read ? <Text style={styles.notificationMarker}>NEW</Text> : null}</Pressable>)}{!items.length ? <Text style={styles.copy}>You are up to date. New CRM activity will appear here.</Text> : null}</Card>
  </Screen>;
}
