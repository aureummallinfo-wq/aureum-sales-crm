import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ContactActions, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { FollowUp } from '@/types/api';
import { colors } from '@/theme';

type FollowUpActivity = { id?: string; activity_type?: string; description?: string; created_at?: string; user_name?: string };
type FollowUpDetail = { data: FollowUp; notes?: Array<{ id: string; note?: string; description?: string; created_at?: string }>; activity?: FollowUpActivity[] };

export default function FollowUpDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['follow-up', id], queryFn: ({ signal }) => apiFetch<FollowUpDetail>(`/api/follow-ups/${encodeURIComponent(String(id))}`, { signal }), enabled: Boolean(id) });
  const item = query.data?.data;
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [saving, setSaving] = useState(false);
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !item) return <Screen><ErrorState message="This follow-up could not be opened." onRetry={query.isError ? () => { void query.refetch(); } : undefined} /></Screen>;
  const closed = ['Completed', 'Cancelled', 'Missed'].includes(String(item.status || ''));
  const date = dueDate || item.due_date || '';
  const time = dueTime || item.due_time || '';

  async function saveNote() {
    const value = note.trim();
    if (!id || !value) return;
    setSaving(true);
    try {
      await apiFetch(`/api/follow-ups/${encodeURIComponent(String(id))}/notes`, { method: 'POST', body: JSON.stringify({ note: value }) });
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['follow-up', id] });
      Alert.alert('Note saved', 'The follow-up note was added to the CRM.');
    } catch (error) {
      Alert.alert('Unable to save note', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  }

  async function action(kind: 'complete' | 'missed' | 'cancel' | 'reschedule') {
    if (!id) return;
    if (kind === 'reschedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) { Alert.alert('Check date and time', 'Use YYYY-MM-DD and HH:MM.'); return; }
    setSaving(true);
    try { await apiFetch(`/api/follow-ups/${encodeURIComponent(String(id))}/${kind}`, { method: 'PATCH', body: JSON.stringify(kind === 'reschedule' ? { due_date: date, due_time: time, reason: 'Rescheduled from mobile CRM' } : kind === 'complete' ? { completion_note: 'Completed from mobile CRM' } : {}) }); await queryClient.invalidateQueries({ queryKey: ['follow-up', id] }); Alert.alert('Follow-up updated', kind === 'reschedule' ? 'The new date and time were saved.' : `Marked as ${kind}.`); }
    catch (error) { Alert.alert('Unable to update follow-up', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  return <Screen><BackButton label="Back to follow-ups" /><PageTitle eyebrow="Follow-up" title={item.customer_name || 'Customer commitment'} copy={`${item.follow_up_type || 'General follow-up'} · ${item.status || 'Pending'}`} /><ContactActions phone={item.customer_phone || item.phone} email={item.email} />{item.customer_id ? <SecondaryButton label="Open customer relationship" onPress={() => router.push(`/customer/${item.customer_id}`)} /> : null}<Card><Text style={styles.rowMeta}>Current schedule</Text><Text style={styles.rowTitle}>{item.due_date || 'No date'}{item.due_time ? ` · ${item.due_time}` : ''}</Text><Text style={styles.rowMeta}>Assigned agent</Text><Text style={styles.rowTitle}>{item.assigned_agent || 'Unassigned'}</Text><Text style={styles.rowMeta}>Priority</Text><Text style={styles.rowTitle}>{item.priority || 'Medium'}</Text><Text style={styles.rowMeta}>Notes</Text><Text style={styles.copy}>{item.notes || 'No note added.'}</Text></Card>{!closed ? <Card><Text style={styles.rowTitle}>Reschedule</Text><TextInput value={date} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={time} onChangeText={setDueTime} placeholder="HH:MM" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={saving ? 'Saving…' : 'Save new schedule'} onPress={() => { void action('reschedule'); }} disabled={saving} /><SecondaryButton label="Mark complete" onPress={() => { void action('complete'); }} disabled={saving} /><SecondaryButton label="Mark missed" onPress={() => { void action('missed'); }} disabled={saving} /><SecondaryButton label="Cancel follow-up" onPress={() => { void action('cancel'); }} disabled={saving} /></Card> : null}<Card><Text style={styles.rowTitle}>Add follow-up note</Text><TextInput multiline value={note} onChangeText={setNote} placeholder="Record the customer response or next action…" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={saving ? 'Saving…' : 'Save note'} onPress={() => { void saveNote(); }} disabled={saving || !note.trim()} /></Card><Card><Text style={styles.rowTitle}>Recent notes</Text>{(query.data?.notes || []).map(entry => <View key={entry.id} style={styles.noteRow}><Text style={styles.copy}>{entry.note || entry.description}</Text><Text style={styles.rowMeta}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Recent'}</Text></View>)}{!query.data?.notes?.length ? <Text style={styles.copy}>No notes added yet.</Text> : null}</Card><Card><Text style={styles.rowTitle}>Activity history</Text>{(query.data?.activity || []).map((entry, index) => <View key={entry.id || `${entry.created_at}-${index}`} style={styles.noteRow}><Text style={styles.copy}>{entry.activity_type || 'Activity'}{entry.user_name ? ` · ${entry.user_name}` : ''}</Text><Text style={styles.rowMeta}>{entry.description || 'CRM activity'}{entry.created_at ? ` · ${new Date(entry.created_at).toLocaleString()}` : ''}</Text></View>)}{!query.data?.activity?.length ? <Text style={styles.copy}>No activity recorded yet.</Text> : null}</Card></Screen>;
}
