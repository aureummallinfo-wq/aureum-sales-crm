import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Switch, Text, TextInput, View } from 'react-native';
import { useSession } from '@/auth/session';
import { apiFetch } from '@/api/client';
import { Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';

export default function AccountScreen() {
  const { user, logout } = useSession();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [presence, setPresence] = useState('Online');
  const profileQuery = useQuery({ queryKey: ['account-profile'], queryFn: ({ signal }) => apiFetch<{ user: { full_name?: string; phone?: string; presenceStatus?: string } }>('/api/account/me', { signal }) });
  const notificationQuery = useQuery({ queryKey: ['account-preferences', 'notifications'], queryFn: ({ signal }) => apiFetch<{ data: Record<string, boolean> }>('/api/account/preferences/notifications', { signal }) });
  const appearanceQuery = useQuery({ queryKey: ['account-preferences', 'appearance'], queryFn: ({ signal }) => apiFetch<{ data: { theme?: string; compact_mode?: boolean } }>('/api/account/preferences/appearance', { signal }) });
  const displayQuery = useQuery({ queryKey: ['account-preferences', 'display'], queryFn: ({ signal }) => apiFetch<{ data: { date_format?: string; time_format?: string; timezone?: string } }>('/api/account/preferences/display', { signal }) });

  async function changePassword() {
    if (!currentPassword || !newPassword || newPassword !== confirmPassword) { Alert.alert('Check password', 'Enter all password fields and make sure the new passwords match.'); return; }
    setSaving(true);
    try { await apiFetch('/api/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); Alert.alert('Password changed', 'Your password was updated successfully.'); }
    catch (error) { Alert.alert('Unable to change password', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  async function saveProfile() {
    if (!fullName.trim()) { Alert.alert('Name required', 'Enter your full name before saving.'); return; }
    try { await apiFetch('/api/account/me/profile', { method: 'PATCH', body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() }) }); await queryClient.invalidateQueries({ queryKey: ['account-profile'] }); Alert.alert('Profile saved', 'Your profile was updated.'); }
    catch (error) { Alert.alert('Unable to save profile', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function setPreference(key: 'notifications' | 'appearance' | 'display', patch: Record<string, unknown>) {
    try { await apiFetch(`/api/account/preferences/${key}`, { method: 'PATCH', body: JSON.stringify(patch) }); await queryClient.invalidateQueries({ queryKey: ['account-preferences', key] }); }
    catch (error) { Alert.alert('Unable to save preference', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function updatePresence(value: string) {
    try { await apiFetch('/api/presence/status', { method: 'PATCH', body: JSON.stringify({ status: value }) }); setPresence(value); }
    catch (error) { Alert.alert('Unable to update presence', error instanceof Error ? error.message : 'Please try again.'); }
  }

  function confirmLogout() { Alert.alert('Sign out', 'Sign out of this mobile device?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } }]); }

  useEffect(() => { if (profileQuery.data?.user?.presenceStatus) setPresence(profileQuery.data.user.presenceStatus); }, [profileQuery.data?.user?.presenceStatus]);

  if (profileQuery.isLoading || notificationQuery.isLoading || appearanceQuery.isLoading || displayQuery.isLoading) return <LoadingState />;
  if (profileQuery.isError || notificationQuery.isError || appearanceQuery.isError || displayQuery.isError) return <Screen><ErrorState message="Your account settings could not load. Pull to refresh and try again." onRetry={() => { void Promise.all([profileQuery.refetch(), notificationQuery.refetch(), appearanceQuery.refetch(), displayQuery.refetch()]); }} /></Screen>;
  const profile = profileQuery.data?.user || {};
  const notifications = notificationQuery.data?.data || {};
  const appearance = appearanceQuery.data?.data || {};
  const display = displayQuery.data?.data || {};
  const dateFormats = ['DD MMM YYYY', 'MMM DD, YYYY', 'YYYY-MM-DD'];
  const timeFormats = ['12-hour', '24-hour'];
  return <Screen refreshing={profileQuery.isRefetching} onRefresh={() => { void Promise.all([profileQuery.refetch(), notificationQuery.refetch(), appearanceQuery.refetch(), displayQuery.refetch()]); }}><PageTitle eyebrow="Account" title={profile.full_name || user?.full_name || 'Your account'} copy={user?.email || 'Manage your CRM mobile access.'} /><Card><Text style={styles.rowTitle}>Profile</Text><Text style={styles.rowMeta}>Role · {user?.role || 'CRM user'}</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={phone || String(profile.phone || '')} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label="Save profile" onPress={() => { void saveProfile(); }} /></Card><Card><Text style={styles.rowTitle}>Presence</Text><Text style={styles.copy}>Choose how your teammates see your availability.</Text><View style={styles.filterRow}>{['Online', 'Away', 'Offline'].map(item => <SecondaryButton key={item} label={item} active={presence === item || (!presence && profile.presenceStatus === item)} onPress={() => { void updatePresence(item); }} />)}</View></Card><Card><Text style={styles.rowTitle}>Notifications</Text>{Object.entries(notifications).map(([key, value]) => <View key={key} style={styles.dashboardRow}><View style={styles.rowBody}><Text style={styles.rowTitle}>{key.replaceAll('_', ' ')}</Text></View><Switch value={Boolean(value)} onValueChange={(next) => { void setPreference('notifications', { [key]: next }); }} trackColor={{ false: colors.border, true: colors.goldPale }} thumbColor={value ? colors.gold : colors.muted} /></View>)}</Card><Card><Text style={styles.rowTitle}>Appearance and display</Text><Text style={styles.rowMeta}>Theme: {appearance.theme || 'light'}</Text><View style={styles.filterRow}>{['light', 'dark', 'system'].map(item => <SecondaryButton key={item} label={item} active={appearance.theme === item} onPress={() => { void setPreference('appearance', { theme: item }); }} />)}</View><View style={styles.dashboardRow}><View style={styles.rowBody}><Text style={styles.rowTitle}>Compact mode</Text><Text style={styles.rowMeta}>Use tighter spacing where supported.</Text></View><Switch value={Boolean(appearance.compact_mode)} onValueChange={(next) => { void setPreference('appearance', { compact_mode: next }); }} trackColor={{ false: colors.border, true: colors.goldPale }} thumbColor={appearance.compact_mode ? colors.gold : colors.muted} /></View><Text style={styles.rowMeta}>Date format</Text><View style={styles.filterRow}>{dateFormats.map(item => <SecondaryButton key={item} label={item} active={display.date_format === item} onPress={() => { void setPreference('display', { date_format: item }); }} />)}</View><Text style={styles.rowMeta}>Time format</Text><View style={styles.filterRow}>{timeFormats.map(item => <SecondaryButton key={item} label={item} active={display.time_format === item} onPress={() => { void setPreference('display', { time_format: item }); }} />)}</View><Text style={styles.rowMeta}>Timezone: {display.timezone || 'Asia/Karachi'}</Text></Card><Card><Text style={styles.rowTitle}>Change password</Text><TextInput secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" placeholderTextColor={colors.muted} style={styles.input} /><TextInput secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor={colors.muted} style={styles.input} /><TextInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={saving ? 'Saving…' : 'Change password'} onPress={() => { void changePassword(); }} disabled={saving} /></Card><Card><Text style={styles.rowTitle}>Sign out</Text><Text style={styles.copy}>This removes the current access session and mobile push registration.</Text><PrimaryButton label="Sign out of this device" onPress={confirmLogout} /></Card></Screen>;
}
