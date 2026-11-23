import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, DateRangeControls, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';
import { dateRangeBounds, dateRangeReady, DateRangeValue } from '@/lib/date-range';

type ManagedUser = { id: string; full_name?: string; email?: string; phone?: string; role?: string; status?: string; team_name?: string; teamName?: string; inviteStatus?: string; lastLoginAt?: string; canDelete?: boolean };
type UserResponse = { data: ManagedUser[]; teams?: Array<{ id: string; name?: string }>; meta?: { total?: number } };

const roleOptions = [
  { label: 'All', value: '' },
  { label: 'Sales agents', value: 'sales_agent' },
  { label: 'Managers', value: 'sales_manager' },
  { label: 'HR', value: 'hr' },
  { label: 'Project managers', value: 'project_manager' }
];

export default function UsersScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [newRole, setNewRole] = useState('sales_agent');
  const [newTeamId, setNewTeamId] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const canManage = ['super_admin', 'sales_manager'].includes(String(user?.role || '').toLowerCase());
  const bounds = dateRangeBounds(dateRange, appliedStart, appliedEnd);
  const rangeReady = dateRangeReady(dateRange, appliedStart, appliedEnd);
  const query = useQuery({
    queryKey: ['users', user?.id, search, roleFilter, dateRange, appliedStart, appliedEnd],
    queryFn: ({ signal }) => { const params = new URLSearchParams({ search: search.trim(), role: roleFilter }); if (bounds) { params.set('dateFrom', bounds.start); params.set('dateTo', bounds.end); } return apiFetch<UserResponse>(`/api/users?${params.toString()}`, { signal }); },
    placeholderData: keepPreviousData,
    enabled: Boolean(user) && canManage && rangeReady
  });

  async function createUser() {
    if (!fullName.trim() || !email.trim() || temporaryPassword.length < 8) { Alert.alert('Check user details', 'Enter a name, valid email, and a temporary password of at least 8 characters.'); return; }
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), role: newRole, teamId: newTeamId || undefined, password: temporaryPassword }) });
      setFullName(''); setEmail(''); setTemporaryPassword(''); setNewTeamId(''); setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      Alert.alert('User created', 'The user was added to the CRM workspace.');
    } catch (error) { Alert.alert('Unable to create user', error instanceof Error ? error.message : 'Please try again.'); }
  }

  if (!canManage) return <Screen><ErrorState message="User management is available only to permitted CRM administrators." /></Screen>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="Users could not load. Pull to refresh and try again." onRetry={() => { void query.refetch(); }} /></Screen>;

  function updateDateRange(next: { value?: DateRangeValue; customStart?: string; customEnd?: string }) {
    if (next.value) { setDateRange(next.value); setAppliedStart(''); setAppliedEnd(''); }
    if (next.customStart !== undefined) setCustomStart(next.customStart);
    if (next.customEnd !== undefined) setCustomEnd(next.customEnd);
  }
  function applyCustomRange() {
    const next = dateRangeBounds('custom', customStart, customEnd);
    if (!next) { Alert.alert('Check dates', 'Enter valid start and end dates in YYYY-MM-DD format.'); return; }
    setAppliedStart(next.start); setAppliedEnd(next.end);
  }

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Administration" title="Users" copy="Manage the CRM users visible within your role and team scope." />
    <View style={styles.dashboardActions}><Pressable onPress={() => setShowCreate(value => !value)} style={styles.dashboardPrimaryAction}><Text style={styles.dashboardPrimaryActionText}>{showCreate ? 'Close form' : '＋ Add user'}</Text></Pressable><Text style={styles.rowMeta}>{query.data?.meta?.total ?? query.data?.data?.length ?? 0} users</Text></View>
    <DateRangeControls value={dateRange} customStart={customStart} customEnd={customEnd} onChange={updateDateRange} onApply={applyCustomRange} applyDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)} />

    {showCreate ? <Card><Text style={styles.rowTitle}>Create user</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Work email" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={temporaryPassword} onChangeText={setTemporaryPassword} secureTextEntry placeholder="Temporary password" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>Role</Text><View style={styles.filterRow}>{(user?.role === 'super_admin' ? ['sales_agent', 'sales_manager', 'hr', 'project_manager'] : ['sales_agent']).map(option => <SecondaryButton key={option} label={option.replaceAll('_', ' ')} active={newRole === option} onPress={() => setNewRole(option)} />)}</View><Text style={styles.label}>Team</Text><View style={styles.filterRow}><SecondaryButton label="Unassigned" active={!newTeamId} onPress={() => setNewTeamId('')} />{(query.data?.teams || []).map(team => <SecondaryButton key={team.id} label={team.name || team.id} active={newTeamId === team.id} onPress={() => setNewTeamId(team.id)} />)}</View><PrimaryButton label="Create user" onPress={() => { void createUser(); }} /></Card> : null}

    <Card><TextInput value={search} onChangeText={setSearch} placeholder="Search name, email, or phone" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.filterRow}>{roleOptions.map(option => <SecondaryButton key={option.value || 'all'} label={option.label} active={roleFilter === option.value} onPress={() => setRoleFilter(option.value)} />)}</View></Card>

    {!rangeReady ? <Card><Text style={styles.copy}>Apply both custom dates to load this view.</Text></Card> : <Card>{(query.data?.data || []).map(item => <Pressable accessibilityRole="button" key={item.id} onPress={() => router.push(`/user/${item.id}`)} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.full_name || 'Unnamed user'}</Text><Text style={styles.rowMeta}>{item.email || 'No email'}{item.phone ? ` · ${item.phone}` : ''}</Text><Text style={styles.rowMeta}>{String(item.role || 'user').replaceAll('_', ' ')} · {item.teamName || item.team_name || 'Unassigned'}</Text></View><Text style={styles.badge}>{item.status || item.inviteStatus || 'Active'}</Text><Text style={styles.dashboardRowChevron}>›</Text></Pressable>)}{!query.data?.data?.length ? <Text style={styles.copy}>No users match the selected filters.</Text> : null}</Card>}
  </Screen>;
}
