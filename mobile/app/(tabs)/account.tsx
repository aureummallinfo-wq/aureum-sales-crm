import { useState } from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { useSession } from '@/auth/session';
import { apiFetch } from '@/api/client';
import { Card, PageTitle, PrimaryButton, Screen, styles } from '@/components/ui';
import { colors } from '@/theme';

export default function AccountScreen() {
  const { user, logout } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (!currentPassword || !newPassword || newPassword !== confirmPassword) { Alert.alert('Check password', 'Enter all password fields and make sure the new passwords match.'); return; }
    setSaving(true);
    try { await apiFetch('/api/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); Alert.alert('Password changed', 'Your password was updated successfully.'); }
    catch (error) { Alert.alert('Unable to change password', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  function confirmLogout() { Alert.alert('Sign out', 'Sign out of this mobile device?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } }]); }

  return <Screen><PageTitle eyebrow="Account" title={user?.full_name || 'Your account'} copy={user?.email || 'Manage your CRM mobile access.'} /><Card><Text style={styles.rowMeta}>Role</Text><Text style={styles.rowTitle}>{user?.role || 'CRM user'}</Text><Text style={styles.rowMeta}>Mobile security</Text><Text style={styles.copy}>Your session and notification token are stored and managed securely by the CRM server.</Text></Card><Card><Text style={styles.rowTitle}>Change password</Text><TextInput secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" placeholderTextColor={colors.muted} style={styles.input} /><TextInput secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor={colors.muted} style={styles.input} /><TextInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={saving ? 'Saving…' : 'Change password'} onPress={() => { void changePassword(); }} disabled={saving} /></Card><Card><Text style={styles.rowTitle}>Sign out</Text><Text style={styles.copy}>This removes the current access session and mobile push registration.</Text><PrimaryButton label="Sign out of this device" onPress={confirmLogout} /></Card></Screen>;
}
