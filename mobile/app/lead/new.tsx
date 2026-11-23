import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiFetch } from '@/api/client';
import { BackButton, Card, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function NewLeadScreen() {
  const queryClient = useQueryClient();
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
  const [leadSource, setLeadSource] = useState('Manual Entry');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('New');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!fullName.trim() || !phone.trim() || !interestedIn.trim()) {
      setError('Name, phone, and interest are required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          whatsapp_number: whatsappNumber.trim() || phone.trim(),
          email: email.trim(),
          city: city.trim(),
          area: area.trim(),
          interested_in: interestedIn.trim(),
          budget: budget.trim(),
          preferred_location: preferredLocation.trim(),
          purpose: purpose.trim(),
          lead_source: leadSource.trim() || 'Manual Entry',
          priority,
          status
        })
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      ]);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The lead could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen><BackButton label="Back to leads" /><PageTitle eyebrow="Pipeline" title="Add new lead" copy="Capture the enquiry while the conversation is fresh." /><Card><Text style={styles.eyebrow}>Customer information</Text><Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Customer name" /><Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+92 300 0000000" keyboardType="phone-pad" /><Field label="WhatsApp number" value={whatsappNumber} onChangeText={setWhatsappNumber} placeholder="Same as phone if blank" keyboardType="phone-pad" /><Field label="Email" value={email} onChangeText={setEmail} placeholder="customer@example.com" keyboardType="email-address" /><Field label="City" value={city} onChangeText={setCity} placeholder="Lahore" /><Field label="Area / locality" value={area} onChangeText={setArea} placeholder="DHA, Gulberg…" /></Card><Card><Text style={styles.eyebrow}>Requirement information</Text><Field label="Interested in" value={interestedIn} onChangeText={setInterestedIn} placeholder="Apartment, shop, office…" /><Field label="Budget" value={budget} onChangeText={setBudget} placeholder="PKR 25M" /><Field label="Preferred location" value={preferredLocation} onChangeText={setPreferredLocation} placeholder="Sector C, commercial hub…" /><Field label="Purpose" value={purpose} onChangeText={setPurpose} placeholder="Investment, living, business…" /></Card><Card><Text style={styles.eyebrow}>CRM information</Text><Field label="Lead source" value={leadSource} onChangeText={setLeadSource} placeholder="Website, WhatsApp, Manual Entry…" /><Text style={styles.label}>Priority</Text><View style={styles.filterRow}>{['Low', 'Medium', 'High', 'Urgent'].map(item => <SecondaryButton key={item} label={item} active={priority === item} onPress={() => setPriority(item)} />)}</View><Text style={styles.label}>Initial status</Text><View style={styles.filterRow}>{['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'].map(item => <SecondaryButton key={item} label={item} active={status === item} onPress={() => setStatus(item)} />)}</View><PrimaryButton label={saving ? 'Saving…' : 'Save lead'} onPress={submit} disabled={saving} />{error ? <Text style={styles.error}>{error}</Text> : null}</Card><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>The server will assign this lead according to your CRM role and permitted team scope.</Text></Screen></KeyboardAvoidingView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' }) {
  return <View style={{ gap: 7 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'} style={styles.input} /></View>;
}
