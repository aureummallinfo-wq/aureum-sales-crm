import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, styles } from '@/components/ui';
import { ApiList, Lead, Note } from '@/types/api';
import { colors } from '@/theme';

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const query = useQuery({ queryKey: ['lead', id], queryFn: () => apiFetch<{ data: Lead }>(`/api/leads/${encodeURIComponent(String(id))}`), enabled: Boolean(id) });
  const notesQuery = useQuery({ queryKey: ['lead-notes', id], queryFn: () => apiFetch<ApiList<Note>>(`/api/leads/${encodeURIComponent(String(id))}/notes`), enabled: Boolean(id) });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data?.data) return <Screen><ErrorState message="This lead could not be opened." /></Screen>;
  const lead = query.data.data;

  async function saveNote() {
    const value = note.trim();
    if (!value || !id) return;
    setSavingNote(true);
    try {
      await apiFetch(`/api/leads/${encodeURIComponent(String(id))}/notes`, { method: 'POST', body: JSON.stringify({ note: value }) });
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['lead-notes', id] });
      Alert.alert('Note saved', 'The lead note was added to the CRM.');
    } catch (error) {
      Alert.alert('Unable to save note', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSavingNote(false); }
  }

  return <Screen>
    <BackButton label="Back to leads" />
    <PageTitle eyebrow="Lead profile" title={lead.full_name} copy={`${lead.status || 'New'} · ${lead.assigned_agent || 'Unassigned'}`} />
    {lead.customer_id ? <PrimaryButton label="Open customer relationship" onPress={() => router.push(`/customer/${lead.customer_id}`)} /> : null}
    <Card><Text style={styles.rowMeta}>Phone</Text><Text style={styles.rowTitle}>{lead.phone || 'Not provided'}</Text><Text style={styles.rowMeta}>Email</Text><Text style={styles.rowTitle}>{lead.email || 'Not provided'}</Text><Text style={styles.rowMeta}>Interested in</Text><Text style={styles.rowTitle}>{lead.interested_in || 'Not provided'}</Text><Text style={styles.rowMeta}>Source</Text><Text style={styles.rowTitle}>{lead.lead_source || 'Manual Entry'}</Text></Card>
    <Card><Text style={styles.rowTitle}>Add lead note</Text><TextInput multiline value={note} onChangeText={setNote} placeholder="Write useful context for the next conversation…" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={savingNote ? 'Saving…' : 'Save note'} onPress={() => { void saveNote(); }} disabled={savingNote || !note.trim()} /></Card>
    <Card><Text style={styles.rowTitle}>Recent notes</Text>{notesQuery.isLoading ? <Text style={styles.copy}>Loading notes…</Text> : notesQuery.isError ? <Text style={styles.error}>Notes could not load.</Text> : (notesQuery.data?.data || []).slice(0, 10).map(item => <View key={item.id} style={styles.noteRow}><Text style={styles.copy}>{item.note || item.description}</Text><Text style={styles.rowMeta}>{item.user_name || 'Aureum teammate'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ''}</Text></View>)}{!notesQuery.isLoading && !notesQuery.data?.data?.length ? <Text style={styles.copy}>No notes added yet.</Text> : null}</Card>
  </Screen>;
}
