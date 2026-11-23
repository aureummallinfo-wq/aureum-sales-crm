import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ContactActions, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { ApiList, Lead, Note } from '@/types/api';
import { colors } from '@/theme';

type Activity = { id?: string; activity_type?: string; description?: string; created_at?: string; user_name?: string };

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [interestedIn, setInterestedIn] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [purpose, setPurpose] = useState('');
  const [buyingTimeline, setBuyingTimeline] = useState('');
  const query = useQuery({ queryKey: ['lead', id], queryFn: ({ signal }) => apiFetch<{ data: Lead }>(`/api/leads/${encodeURIComponent(String(id))}`, { signal }), enabled: Boolean(id) });
  const notesQuery = useQuery({ queryKey: ['lead-notes', id], queryFn: ({ signal }) => apiFetch<ApiList<Note>>(`/api/leads/${encodeURIComponent(String(id))}/notes`, { signal }), enabled: Boolean(id) });
  const activityQuery = useQuery({ queryKey: ['lead-activity', id], queryFn: ({ signal }) => apiFetch<{ data: Activity[] }>(`/api/leads/${encodeURIComponent(String(id))}/activity`, { signal }), enabled: Boolean(id) });
  const lead = query.data?.data;

  useEffect(() => {
    if (!lead) return;
    setFullName(lead.full_name || '');
    setPhone(lead.phone || '');
    setWhatsappNumber(lead.whatsapp_number || lead.phone || '');
    setEmail(lead.email || '');
    setCity(lead.city || '');
    setArea(lead.area || '');
    setInterestedIn(lead.interested_in || '');
    setBudget(lead.budget || '');
    setPreferredLocation(lead.preferred_location || '');
    setPurpose(lead.purpose || '');
    setBuyingTimeline(lead.buying_timeline || '');
  }, [lead?.id]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !lead) return <Screen><ErrorState message="This lead could not be opened." onRetry={query.isError ? () => { void query.refetch(); } : undefined} /></Screen>;
  const currentLead = lead;

  async function saveDetails() {
    if (!id || !fullName.trim() || !phone.trim() || !interestedIn.trim()) { Alert.alert('Check lead details', 'Name, phone, and interest are required.'); return; }
    setSavingDetails(true);
    try {
      await apiFetch(`/api/leads/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify({ full_name: fullName.trim(), phone: phone.trim(), whatsapp_number: whatsappNumber.trim() || phone.trim(), email: email.trim(), city: city.trim(), area: area.trim(), interested_in: interestedIn.trim(), budget: budget.trim(), preferred_location: preferredLocation.trim(), purpose: purpose.trim(), buying_timeline: buyingTimeline.trim() }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['lead', id] }), queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
      Alert.alert('Lead updated', 'The lead details were saved to the CRM.');
    } catch (error) { Alert.alert('Unable to update lead', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSavingDetails(false); }
  }

  async function changeStatus(status: string) {
    if (!id || status === currentLead.status) return;
    try { await apiFetch(`/api/leads/${encodeURIComponent(String(id))}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ['lead', id] }), queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['follow-ups'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); Alert.alert('Status updated', `Lead status changed to ${status}.`); }
    catch (error) { Alert.alert('Unable to update status', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function saveNote() {
    const value = note.trim();
    if (!value || !id) return;
    setSavingNote(true);
    try {
      await apiFetch(`/api/leads/${encodeURIComponent(String(id))}/notes`, { method: 'POST', body: JSON.stringify({ note: value }) });
      setNote('');
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['lead-notes', id] }), queryClient.invalidateQueries({ queryKey: ['lead-activity', id] })]);
      Alert.alert('Note saved', 'The lead note was added to the CRM.');
    } catch (error) {
      Alert.alert('Unable to save note', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSavingNote(false); }
  }

  return <Screen>
    <BackButton label="Back to leads" />
    <PageTitle eyebrow="Lead profile" title={currentLead.full_name} copy={`${currentLead.status || 'New'} · ${currentLead.assigned_agent || 'Unassigned'}`} />
    <ContactActions phone={currentLead.phone} whatsapp={currentLead.whatsapp_number} email={currentLead.email} />
    {currentLead.customer_id ? <PrimaryButton label="Open customer relationship" onPress={() => router.push(`/customer/${currentLead.customer_id}`)} /> : null}
    <Card><Text style={styles.rowMeta}>Phone</Text><Text style={styles.rowTitle}>{currentLead.phone || 'Not provided'}</Text><Text style={styles.rowMeta}>Email</Text><Text style={styles.rowTitle}>{currentLead.email || 'Not provided'}</Text><Text style={styles.rowMeta}>Interested in</Text><Text style={styles.rowTitle}>{currentLead.interested_in || 'Not provided'}</Text><Text style={styles.rowMeta}>Location</Text><Text style={styles.rowTitle}>{[currentLead.city, currentLead.area].filter(Boolean).join(' · ') || 'Not provided'}</Text><Text style={styles.rowMeta}>Budget</Text><Text style={styles.rowTitle}>{currentLead.budget || 'Not provided'}</Text><Text style={styles.rowMeta}>Source</Text><Text style={styles.rowTitle}>{currentLead.lead_source || 'Manual Entry'}</Text></Card>
    <Card><Text style={styles.rowTitle}>Edit lead details</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={whatsappNumber} onChangeText={setWhatsappNumber} keyboardType="phone-pad" placeholder="WhatsApp number" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={area} onChangeText={setArea} placeholder="Area / locality" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={interestedIn} onChangeText={setInterestedIn} placeholder="Interested in" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={budget} onChangeText={setBudget} placeholder="Budget" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={preferredLocation} onChangeText={setPreferredLocation} placeholder="Preferred location" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={purpose} onChangeText={setPurpose} placeholder="Purpose" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={buyingTimeline} onChangeText={setBuyingTimeline} placeholder="Buying timeline" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={savingDetails ? 'Saving…' : 'Save lead details'} onPress={() => { void saveDetails(); }} disabled={savingDetails} /></Card>
    <Card><Text style={styles.rowTitle}>Lead status</Text><View style={styles.filterRow}>{['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'].map(status => <SecondaryButton key={status} label={status} active={currentLead.status === status} onPress={() => { void changeStatus(status); }} />)}</View></Card>
    <Card><Text style={styles.rowTitle}>Add lead note</Text><TextInput multiline value={note} onChangeText={setNote} placeholder="Write useful context for the next conversation…" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={savingNote ? 'Saving…' : 'Save note'} onPress={() => { void saveNote(); }} disabled={savingNote || !note.trim()} /></Card>
    <Card><Text style={styles.rowTitle}>Recent notes</Text>{notesQuery.isLoading ? <Text style={styles.copy}>Loading notes…</Text> : notesQuery.isError ? <View style={styles.actionStack}><Text style={styles.error}>Notes could not load.</Text><SecondaryButton label="Try again" onPress={() => { void notesQuery.refetch(); }} /></View> : (notesQuery.data?.data || []).slice(0, 10).map(item => <View key={item.id} style={styles.noteRow}><Text style={styles.copy}>{item.note || item.description}</Text><Text style={styles.rowMeta}>{item.user_name || 'Aureum teammate'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ''}</Text></View>)}{!notesQuery.isLoading && !notesQuery.data?.data?.length ? <Text style={styles.copy}>No notes added yet.</Text> : null}</Card>
    <Card><Text style={styles.rowTitle}>Activity history</Text>{activityQuery.isLoading ? <Text style={styles.copy}>Loading activity…</Text> : activityQuery.isError ? <View style={styles.actionStack}><Text style={styles.error}>Activity could not load.</Text><SecondaryButton label="Try again" onPress={() => { void activityQuery.refetch(); }} /></View> : (activityQuery.data?.data || []).slice(0, 12).map((item, index) => <View key={item.id || `${item.created_at}-${index}`} style={styles.noteRow}><Text style={styles.copy}>{item.activity_type || 'Activity'}{item.user_name ? ` · ${item.user_name}` : ''}</Text><Text style={styles.rowMeta}>{item.description || 'CRM activity'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}</Text></View>)}{!activityQuery.isLoading && !activityQuery.data?.data?.length ? <Text style={styles.copy}>No activity recorded yet.</Text> : null}</Card>
  </Screen>;
}
