import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { FollowUp } from '@/types/api';
import { colors } from '@/theme';

type FollowUpDetail = { data: FollowUp; notes?: Array<{ id: string; note?: string; description?: string; created_at?: string }> };

export default function FollowUpDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['follow-up', id], queryFn: () => apiFetch<FollowUpDetail>(`/api/follow-ups/${encodeURIComponent(String(id))}`), enabled: Boolean(id) });
  const item = query.data?.data;
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [saving, setSaving] = useState(false);
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !item) return <Screen><ErrorState message="This follow-up could not be opened." /></Screen>;
  const closed = ['Completed', 'Cancelled', 'Missed'].includes(String(item.status || ''));
  const date = dueDate || item.due_date || '';
  const time = dueTime || item.due_time || '';

  async function action(kind: 'complete' | 'missed' | 'cancel' | 'reschedule') {
    if (!id) return;
    if (kind === 'reschedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) { Alert.alert('Check date and time', 'Use YYYY-MM-DD and HH:MM.'); return; }
    setSaving(true);
    try { await apiFetch(`/api/follow-ups/${encodeURIComponent(String(id))}/${kind}`, { method: 'PATCH', body: JSON.stringify(kind === 'reschedule' ? { due_date: date, due_time: time, reason: 'Rescheduled from mobile CRM' } : kind === 'complete' ? { completion_note: 'Completed from mobile CRM' } : {}) }); await queryClient.invalidateQueries({ queryKey: ['follow-up', id] }); Alert.alert('Follow-up updated', kind === 'reschedule' ? 'The new date and time were saved.' : `Marked as ${kind}.`); }
    catch (error) { Alert.alert('Unable to update follow-up', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  return <Screen><BackButton label="Back to follow-ups" /><PageTitle eyebrow="Follow-up" title={item.customer_name || 'Customer commitment'} copy={`${item.follow_up_type || 'General follow-up'} · ${item.status || 'Pending'}`} /><Card><Text style={styles.rowMeta}>Current schedule</Text><Text style={styles.rowTitle}>{item.due_date || 'No date'}{item.due_time ? ` · ${item.due_time}` : ''}</Text><Text style={styles.rowMeta}>Assigned agent</Text><Text style={styles.rowTitle}>{item.assigned_agent || 'Unassigned'}</Text><Text style={styles.rowMeta}>Notes</Text><Text style={styles.copy}>{item.notes || 'No note added.'}</Text></Card>{!closed ? <Card><Text style={styles.rowTitle}>Reschedule</Text><TextInput value={date} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={time} onChangeText={setDueTime} placeholder="HH:MM" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={saving ? 'Saving…' : 'Save new schedule'} onPress={() => { void action('reschedule'); }} disabled={saving} /><SecondaryButton label="Mark complete" onPress={() => { void action('complete'); }} disabled={saving} /><SecondaryButton label="Mark missed" onPress={() => { void action('missed'); }} disabled={saving} /><SecondaryButton label="Cancel follow-up" onPress={() => { void action('cancel'); }} disabled={saving} /></Card> : null}<Card><Text style={styles.rowTitle}>Recent notes</Text>{(query.data?.notes || []).map(note => <Text key={note.id} style={styles.copy}>{note.note || note.description}</Text>)}{!query.data?.notes?.length ? <Text style={styles.copy}>No notes added yet.</Text> : null}</Card></Screen>;
}
