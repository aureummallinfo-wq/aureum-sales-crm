import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { BackButton, Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';

type ManagedUser = { id: string; full_name?: string; fullName?: string; email?: string; phone?: string; role?: string; status?: string; team_id?: string | null; teamId?: string | null; teamName?: string; team_name?: string; inviteStatus?: string; lastLoginAt?: string; lastActivityAt?: string; canDelete?: boolean };
type UserDetail = { user?: ManagedUser; data?: ManagedUser; auditLogs?: Array<{ id?: string; action?: string; description?: string; createdAt?: string; created_at?: string; actorName?: string }> };
type Team = { id: string; name?: string };

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = ['super_admin', 'sales_manager'].includes(String(user?.role || '').toLowerCase());
  const canDelete = String(user?.role || '').toLowerCase() === 'super_admin';
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('sales_agent');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ['managed-user', id], queryFn: ({ signal }) => apiFetch<UserDetail>(`/api/users/${encodeURIComponent(String(id))}`, { signal }), enabled: Boolean(id) && canManage });
  const teamsQuery = useQuery({ queryKey: ['user-teams', user?.id], queryFn: ({ signal }) => apiFetch<{ data: Team[] }>('/api/users/teams', { signal }), enabled: Boolean(user) && canManage });

  const target = query.data?.user || query.data?.data;
  useEffect(() => { if (target) { setFullName(target.full_name || target.fullName || ''); setPhone(target.phone || ''); setRole(target.role || 'sales_agent'); setTeamId(String(target.team_id || target.teamId || '')); } }, [target?.id, target?.full_name, target?.fullName, target?.phone, target?.role, target?.team_id, target?.teamId]);

  async function updateUser(patch: Record<string, unknown>, message: string) {
    if (!id) return;
    setSaving(true);
    try { await apiFetch(`/api/users/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(patch) }); await queryClient.invalidateQueries({ queryKey: ['managed-user', id] }); await queryClient.invalidateQueries({ queryKey: ['users'] }); Alert.alert('User updated', message); }
    catch (error) { Alert.alert('Unable to update user', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }

  async function resetPassword() {
    if (!id) return;
    try { const response = await apiFetch<{ credentials?: { email?: string; temporaryPassword?: string; expiresAt?: string }; message?: string }>(`/api/users/${encodeURIComponent(String(id))}/reset-password`, { method: 'POST' }); const credentials = response.credentials; if (credentials?.temporaryPassword) Alert.alert('Temporary password', `${credentials.email || target?.email || 'User'}\n\n${credentials.temporaryPassword}\n\nShare this securely. It expires at ${credentials.expiresAt ? new Date(credentials.expiresAt).toLocaleString() : 'the configured time'}.`); else Alert.alert('Password reset', response.message || 'The temporary password was created.'); await queryClient.invalidateQueries({ queryKey: ['managed-user', id] }); }
    catch (error) { Alert.alert('Unable to reset password', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function sendAccessEmail() {
    if (!id) return;
    try { const response = await apiFetch<{ email?: { message?: string } }>(`/api/users/${encodeURIComponent(String(id))}/send-access-email`, { method: 'POST' }); await queryClient.invalidateQueries({ queryKey: ['managed-user', id] }); Alert.alert('Access email', response.email?.message || 'The access email action was recorded.'); }
    catch (error) { Alert.alert('Unable to send access email', error instanceof Error ? error.message : 'Please try again.'); }
  }

  function confirmDelete() { if (!id || !target) return; Alert.alert('Delete user', `Delete ${target.full_name || target.fullName || 'this user'}? This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void (async () => { try { await apiFetch(`/api/users/${encodeURIComponent(String(id))}`, { method: 'DELETE' }); await queryClient.invalidateQueries({ queryKey: ['users'] }); router.back(); } catch (error) { Alert.alert('Unable to delete user', error instanceof Error ? error.message : 'Please try again.'); } })(); } }]); }

  if (!canManage) return <Screen><ErrorState message="User management is available only to permitted CRM administrators." /></Screen>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !target) return <Screen><ErrorState message="This user could not be opened in your permitted scope." onRetry={query.isError ? () => { void query.refetch(); } : undefined} /></Screen>;
  const active = String(target.status || '').toLowerCase() === 'active';
  return <Screen>
    <BackButton label="Back to users" />
    <PageTitle eyebrow="User management" title={target.full_name || target.fullName || 'User'} copy={`${target.role || 'CRM user'} · ${target.email || 'No email'}`} />
    <Card><Text style={styles.rowTitle}>Profile and access</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>Role</Text><View style={styles.filterRow}>{(user?.role === 'super_admin' ? ['sales_agent', 'sales_manager', 'hr', 'project_manager'] : ['sales_agent']).map(option => <SecondaryButton key={option} label={option.replaceAll('_', ' ')} active={role === option} onPress={() => setRole(option)} disabled={saving || (user?.role === 'sales_manager' && target.role !== 'sales_agent')} />)}</View><Text style={styles.label}>Team</Text><View style={styles.filterRow}><SecondaryButton label="Unassigned" active={!teamId} onPress={() => setTeamId('')} disabled={saving || user?.role !== 'super_admin'} />{(teamsQuery.data?.data || []).map(team => <SecondaryButton key={team.id} label={team.name || team.id} active={teamId === team.id} onPress={() => setTeamId(team.id)} disabled={saving || user?.role !== 'super_admin'} />)}</View><Text style={styles.rowMeta}>Current team · {target.teamName || target.team_name || 'Unassigned'}</Text><Text style={styles.rowMeta}>Invite · {target.inviteStatus || 'Not sent'}</Text><Text style={styles.rowMeta}>Last login · {target.lastLoginAt ? new Date(target.lastLoginAt).toLocaleString() : 'Not recorded'}</Text><PrimaryButton label={saving ? 'Saving…' : 'Save profile'} onPress={() => { void updateUser({ fullName: fullName.trim(), phone: phone.trim(), role, teamId }, 'Profile, role, and team changes were saved.'); }} disabled={saving} /></Card>
    <Card><Text style={styles.rowTitle}>Access actions</Text><View style={styles.filterRow}><SecondaryButton label={active ? 'Deactivate' : 'Activate'} onPress={() => { void updateUser({ status: active ? 'inactive' : 'active' }, `User ${active ? 'deactivated' : 'activated'}.`); }} disabled={target.id === user?.id || saving} /><SecondaryButton label="Send access email" onPress={() => { void sendAccessEmail(); }} /><SecondaryButton label="Reset password" onPress={() => { void resetPassword(); }} /></View>{canDelete && target.canDelete !== false ? <SecondaryButton label="Delete user" onPress={confirmDelete} /> : null}</Card>
    <Card><Text style={styles.rowTitle}>Audit activity</Text>{(query.data?.auditLogs || []).slice(0, 12).map((item, index) => <View key={item.id || `${item.createdAt || item.created_at}-${index}`} style={styles.noteRow}><Text style={styles.copy}>{item.description || item.action || 'User activity'}</Text><Text style={styles.rowMeta}>{item.actorName || 'Aureum administrator'}{item.createdAt || item.created_at ? ` · ${new Date(item.createdAt || item.created_at || '').toLocaleString()}` : ''}</Text></View>)}{!query.data?.auditLogs?.length ? <Text style={styles.copy}>No audit activity is available.</Text> : null}</Card>
  </Screen>;
}
