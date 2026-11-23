import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { BackButton, Card, ContactActions, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { Customer, FollowUp, Note } from '@/types/api';
import { colors } from '@/theme';

type CustomerDetail = { data: Customer; notes?: Note[]; followUps?: FollowUp[] };
type Activity = { id?: string; activity_type?: string; description?: string; created_at?: string; user_name?: string };

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [followUpType, setFollowUpType] = useState('Phone call');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('10:00');
  const [followUpNote, setFollowUpNote] = useState('');
  const [saving, setSaving] = useState(false);
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
  const query = useQuery({ queryKey: ['customer', id], queryFn: ({ signal }) => apiFetch<CustomerDetail>(`/api/customers/${encodeURIComponent(String(id))}`, { signal }), enabled: Boolean(id) });
  const activityQuery = useQuery({ queryKey: ['customer-activity', id], queryFn: ({ signal }) => apiFetch<{ data: Activity[] }>(`/api/customers/${encodeURIComponent(String(id))}/timeline`, { signal }), enabled: Boolean(id) });
  const customer = query.data?.data;

  useEffect(() => {
    if (!customer) return;
    setFullName(customer.full_name || '');
    setPhone(customer.phone || '');
    setWhatsappNumber(customer.whatsapp_number || customer.phone || '');
    setEmail(customer.email || '');
    setCity(customer.city || '');
    setArea(customer.area || '');
    setInterestedIn(customer.interested_in || '');
    setBudget(customer.budget || '');
    setPreferredLocation(customer.preferred_location || '');
    setPurpose(customer.purpose || '');
    setBuyingTimeline(customer.buying_timeline || '');
  }, [customer?.id]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !customer) return <Screen><ErrorState message="This customer could not be opened." onRetry={query.isError ? () => { void query.refetch(); } : undefined} /></Screen>;
  const currentCustomer = customer;
  const customerNotes = query.data?.notes || [];
  const customerFollowUps = query.data?.followUps || [];

  async function saveDetails() {
    if (!id || !fullName.trim() || !phone.trim()) { Alert.alert('Check customer details', 'Name and phone are required.'); return; }
    setSavingDetails(true);
    try {
      await apiFetch(`/api/customers/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify({ full_name: fullName.trim(), phone: phone.trim(), whatsapp_number: whatsappNumber.trim() || phone.trim(), email: email.trim(), city: city.trim(), area: area.trim(), interested_in: interestedIn.trim(), budget: budget.trim(), preferred_location: preferredLocation.trim(), purpose: purpose.trim(), buying_timeline: buyingTimeline.trim() }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['customer', id] }), queryClient.invalidateQueries({ queryKey: ['customer-activity', id] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
      Alert.alert('Customer updated', 'The customer details were saved to the CRM.');
    } catch (error) { Alert.alert('Unable to update customer', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSavingDetails(false); }
  }

  async function changeStatus(status: string) {
    if (!id || status === (currentCustomer.customer_status || currentCustomer.status)) return;
    try { await apiFetch(`/api/customers/${encodeURIComponent(String(id))}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ['customer', id] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['follow-ups'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); Alert.alert('Status updated', `Customer status changed to ${status}.`); }
    catch (error) { Alert.alert('Unable to update status', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function saveNote() {
    const value = note.trim();
    if (!value || !id) return;
    setSaving(true);
    try { await apiFetch(`/api/customers/${encodeURIComponent(String(id))}/notes`, { method: 'POST', body: JSON.stringify({ note: value }) }); setNote(''); await Promise.all([queryClient.invalidateQueries({ queryKey: ['customer', id] }), queryClient.invalidateQueries({ queryKey: ['customer-activity', id] })]); Alert.alert('Note saved', 'The customer note was added to the CRM.'); }
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
    <PageTitle eyebrow="Customer relationship" title={currentCustomer.full_name} copy={`${currentCustomer.status || currentCustomer.customer_status || 'Active'} · ${currentCustomer.assigned_agent || 'Unassigned'}`} />
    <ContactActions phone={currentCustomer.phone} whatsapp={currentCustomer.whatsapp_number} email={currentCustomer.email} />
    <Card><Text style={styles.rowMeta}>Phone</Text><Text style={styles.rowTitle}>{currentCustomer.phone || 'Not provided'}</Text><Text style={styles.rowMeta}>Email</Text><Text style={styles.rowTitle}>{currentCustomer.email || 'Not provided'}</Text><Text style={styles.rowMeta}>Interested in</Text><Text style={styles.rowTitle}>{currentCustomer.interested_in || 'Not provided'}</Text><Text style={styles.rowMeta}>Location</Text><Text style={styles.rowTitle}>{[currentCustomer.city, currentCustomer.area].filter(Boolean).join(' · ') || 'Not provided'}</Text><Text style={styles.rowMeta}>Budget</Text><Text style={styles.rowTitle}>{currentCustomer.budget || 'Not provided'}</Text></Card>
    <Card><Text style={styles.rowTitle}>Edit customer details</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={whatsappNumber} onChangeText={setWhatsappNumber} keyboardType="phone-pad" placeholder="WhatsApp number" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={area} onChangeText={setArea} placeholder="Area / locality" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={interestedIn} onChangeText={setInterestedIn} placeholder="Interested in" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={budget} onChangeText={setBudget} placeholder="Budget" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={preferredLocation} onChangeText={setPreferredLocation} placeholder="Preferred location" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={purpose} onChangeText={setPurpose} placeholder="Purpose" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={buyingTimeline} onChangeText={setBuyingTimeline} placeholder="Buying timeline" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={savingDetails ? 'Saving…' : 'Save customer details'} onPress={() => { void saveDetails(); }} disabled={savingDetails} /></Card>
    <Card><Text style={styles.rowTitle}>Customer status</Text><View style={styles.filterRow}>{['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'].map(status => <SecondaryButton key={status} label={status} active={(currentCustomer.customer_status || currentCustomer.status) === status} onPress={() => { void changeStatus(status); }} />)}</View></Card>
    <Card><Text style={styles.rowTitle}>Add customer note</Text><TextInput multiline value={note} onChangeText={setNote} placeholder="Record the latest customer context…" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={saving ? 'Saving…' : 'Save note'} onPress={() => { void saveNote(); }} disabled={saving || !note.trim()} /></Card>
    <Card><Text style={styles.rowTitle}>Schedule follow-up</Text><TextInput value={followUpType} onChangeText={setFollowUpType} placeholder="Phone call, WhatsApp, site visit…" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={dueTime} onChangeText={setDueTime} placeholder="HH:MM" placeholderTextColor={colors.muted} style={styles.input} /><TextInput multiline value={followUpNote} onChangeText={setFollowUpNote} placeholder="Optional follow-up note" placeholderTextColor={colors.muted} style={styles.noteInput} /><PrimaryButton label={saving ? 'Saving…' : 'Schedule follow-up'} onPress={() => { void scheduleFollowUp(); }} disabled={saving} /></Card>
    <Card><Text style={styles.rowTitle}>Recent notes</Text>{customerNotes.slice(0, 8).map(item => <View key={item.id} style={styles.noteRow}><Text style={styles.copy}>{item.note || item.description}</Text><Text style={styles.rowMeta}>{item.user_name || 'Aureum teammate'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ''}</Text></View>)}{!customerNotes.length ? <Text style={styles.copy}>No notes added yet.</Text> : null}</Card>
    <Card><Text style={styles.rowTitle}>Follow-up history</Text>{customerFollowUps.slice(0, 8).map(item => <View key={item.id} style={styles.noteRow}><Text style={styles.copy}>{item.follow_up_type || 'Follow-up'} · {item.status || 'Pending'}</Text><Text style={styles.rowMeta}>{item.due_date || 'No date'}{item.due_time ? ` · ${item.due_time}` : ''}</Text></View>)}{!customerFollowUps.length ? <Text style={styles.copy}>No follow-ups yet.</Text> : null}</Card>
    <Card><Text style={styles.rowTitle}>Activity history</Text>{activityQuery.isLoading ? <Text style={styles.copy}>Loading activity…</Text> : activityQuery.isError ? <View style={styles.actionStack}><Text style={styles.error}>Activity could not load.</Text><SecondaryButton label="Try again" onPress={() => { void activityQuery.refetch(); }} /></View> : (activityQuery.data?.data || []).slice(0, 12).map((item, index) => <View key={item.id || `${item.created_at}-${index}`} style={styles.noteRow}><Text style={styles.copy}>{item.activity_type || 'Activity'}{item.user_name ? ` · ${item.user_name}` : ''}</Text><Text style={styles.rowMeta}>{item.description || 'CRM activity'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}</Text></View>)}{!activityQuery.isLoading && !activityQuery.data?.data?.length ? <Text style={styles.copy}>No activity recorded yet.</Text> : null}</Card>
  </Screen>;
}
