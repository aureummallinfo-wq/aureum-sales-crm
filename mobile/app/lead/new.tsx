import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api/client';
import { BackButton, Card, PageTitle, PrimaryButton, Screen, styles } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function NewLeadScreen() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [interestedIn, setInterestedIn] = useState('');
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
          email: email.trim(),
          interested_in: interestedIn.trim(),
          lead_source: 'Manual Entry'
        })
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The lead could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen><BackButton label="Back to leads" /><PageTitle eyebrow="Pipeline" title="Add new lead" copy="Capture the enquiry while the conversation is fresh." /><Card><Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Customer name" /><Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+92 300 0000000" keyboardType="phone-pad" /><Field label="Email" value={email} onChangeText={setEmail} placeholder="customer@example.com" keyboardType="email-address" /><Field label="Interested in" value={interestedIn} onChangeText={setInterestedIn} placeholder="Apartment, shop, office…" /><PrimaryButton label={saving ? 'Saving…' : 'Save lead'} onPress={submit} disabled={saving} />{error ? <Text style={styles.error}>{error}</Text> : null}</Card><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>The server will assign this lead according to your CRM role and permitted team scope.</Text></Screen></KeyboardAvoidingView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' }) {
  return <View style={{ gap: 7 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'} style={styles.input} /></View>;
}
