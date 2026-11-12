import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, styles } from '@/components/ui';
import { Customer, FollowUp, Note } from '@/types/api';
import { colors } from '@/theme';

type CustomerDetail = { data: Customer; notes?: Note[]; followUps?: FollowUp[] };

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [followUpType, setFollowUpType] = useState('Phone call');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('10:00');
  const [followUpNote, setFollowUpNote] = useState('');
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ['customer', id], queryFn: () => apiFetch<CustomerDetail>(`/api/customers/${encodeURIComponent(String(id))}`), enabled: Boolean(id) });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data?.data) return <Screen><ErrorState message="This customer could not be opened." /></Screen>;
  const customer = query.data.data;

  async function saveNote() {
    const value = note.trim();
    if (!value || !id) return;
    setSaving(true);
    try { await apiFetch(`/api/customers/${encodeURIComponent(String(id))}/notes`, { method: 'POST', body: JSON.stringify({ note: value }) }); setNote(''); await queryClient.invalidateQueries({ queryKey: ['customer', id] }); Alert.alert('Note saved', 'The customer note was added to the CRM.'); }
    catch (error) { Alert.alert('Unable to save note', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  async function scheduleFollowUp() {
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) { Alert.alert('Check follow-up time', 'Use YYYY-MM-DD and HH:MM.'); return; }
    setSaving(true);
    try { await apiFetch(`/api/customers/${encodeURIComponent(String(id))}/follow-ups`, { method: 'POST', body: JSON.stringify({ type: followUpType.trim() || 'General Follow-up', due_date: dueDate, due_time: dueTime, note: followUpNote.trim(), priority: 'Medium' }) }); setFollowUpNote(''); await queryClient.invalidateQueries({ queryKey: ['customer', id] }); Alert.alert('Follow-up scheduled', 'The follow-up is now visible to the assigned CRM user.'); }
    catch (error) { Alert.alert('Unable to schedule follow-up', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  return <Screen>
    <BackButton label="Back to customers" />
    <PageTitle eyebrow="Customer relationship" title={customer.full_name} copy={`${customer.status || customer.customer_status || 'Active'} · ${customer.assigned_agent || 'Unassigned'}`} />
    <Card><Text style={styles.rowMeta}>Phone</Text><Text style={styles.rowTitle}>{customer.phone || 'Not provided'}</Text><Text style={styles.rowMeta}>Email</Text><Text style={styles.rowTitle}>{customer.email || 'Not provided'}</Text><Text style={styles.rowMeta}>Interested in</Text><Text style={styles.rowTitle}>{customer.interested_in || 'Not provided'}</Text></Card>
    <Card><Text style={styles.rowTitle}>Add customer note</Text><TextInput multiline value={note} onChangeText={setNote} placeholder="Record the latest customer context…" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={saving ? 'Saving…' : 'Save note'} onPress={() => { void saveNote(); }} disabled={saving || !note.trim()} /></Card>
    <Card><Text style={styles.rowTitle}>Schedule follow-up</Text><TextInput value={followUpType} onChangeText={setFollowUpType} placeholder="Phone call, WhatsApp, site visit…" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={dueTime} onChangeText={setDueTime} placeholder="HH:MM" placeholderTextColor={colors.muted} style={styles.input} /><TextInput multiline value={followUpNote} onChangeText={setFollowUpNote} placeholder="Optional follow-up note" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={saving ? 'Saving…' : 'Schedule follow-up'} onPress={() => { void scheduleFollowUp(); }} disabled={saving} /></Card>
    <Card><Text style={styles.rowTitle}>Recent notes</Text>{(query.data.notes || []).slice(0, 8).map(item => <View key={item.id} style={styles.noteRow}><Text style={styles.copy}>{item.note || item.description}</Text><Text style={styles.rowMeta}>{item.user_name || 'Aureum teammate'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ''}</Text></View>)}{!query.data.notes?.length ? <Text style={styles.copy}>No notes added yet.</Text> : null}</Card>
    <Card><Text style={styles.rowTitle}>Follow-up history</Text>{(query.data.followUps || []).slice(0, 8).map(item => <View key={item.id} style={styles.noteRow}><Text style={styles.copy}>{item.follow_up_type || 'Follow-up'} · {item.status || 'Pending'}</Text><Text style={styles.rowMeta}>{item.due_date || 'No date'}{item.due_time ? ` · ${item.due_time}` : ''}</Text></View>)}{!query.data.followUps?.length ? <Text style={styles.copy}>No follow-ups yet.</Text> : null}</Card>
  </Screen>;
}
