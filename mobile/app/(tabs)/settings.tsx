import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Linking, Switch, Text, TextInput, View } from 'react-native';
import { apiFetch, getApiBaseUrl } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';

type SettingsData = { company?: Record<string, unknown>; preferences?: Record<string, unknown>; security?: Record<string, unknown>; emailAccess?: Record<string, unknown> };
type NotificationSetting = { event_key: string; event_name?: string; in_app_enabled?: boolean; email_enabled?: boolean };
type PermissionItem = { key?: string; role?: string; allowed?: boolean };
type SettingsActivity = { id?: string; action?: string; description?: string; created_at?: string; actor_name?: string };
type ConfigurationItem = { id?: string; name?: string; color?: string; is_active?: boolean; sort_order?: number };
type ReleaseItem = { id?: string; versionName?: string; versionCode?: number; status?: string; releaseNotes?: string; downloadUrl?: string };

export default function SettingsScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = String(user?.role || '').toLowerCase() === 'super_admin';
  const settingsQuery = useQuery({ queryKey: ['workspace-settings'], queryFn: ({ signal }) => apiFetch<{ data: SettingsData }>('/api/settings', { signal }), enabled: Boolean(user) && canManage });
  const notificationsQuery = useQuery({ queryKey: ['settings-notifications'], queryFn: ({ signal }) => apiFetch<{ data: NotificationSetting[] }>('/api/settings/notifications', { signal }), enabled: Boolean(user) && canManage });
  const permissionsQuery = useQuery({ queryKey: ['settings-permissions'], queryFn: ({ signal }) => apiFetch<{ data: PermissionItem[]; roles?: Record<string, string> }>('/api/settings/permissions', { signal }), enabled: Boolean(user) && canManage });
  const activitiesQuery = useQuery({ queryKey: ['settings-activities'], queryFn: ({ signal }) => apiFetch<{ data: SettingsActivity[] }>('/api/settings/activities', { signal }), enabled: Boolean(user) && canManage });
  const [showPipelineConfig, setShowPipelineConfig] = useState(false);
  const pipelineQuery = useQuery({
    queryKey: ['settings-pipeline-config'],
    queryFn: async ({ signal }) => {
      const [leadStatuses, customerStatuses, tags, sources] = await Promise.all([
        apiFetch<{ data: ConfigurationItem[] }>('/api/settings/lead-statuses', { signal }),
        apiFetch<{ data: ConfigurationItem[] }>('/api/settings/customer-statuses', { signal }),
        apiFetch<{ data: ConfigurationItem[] }>('/api/settings/lead-tags', { signal }),
        apiFetch<{ data: ConfigurationItem[] }>('/api/settings/lead-sources', { signal })
      ]);
      return { leadStatuses: leadStatuses.data || [], customerStatuses: customerStatuses.data || [], tags: tags.data || [], sources: sources.data || [] };
    },
    enabled: Boolean(user) && canManage && showPipelineConfig
  });
  const releasesQuery = useQuery({
    queryKey: ['app-releases'],
    queryFn: ({ signal }) => apiFetch<{ data: ReleaseItem[] }>('/api/app/releases', { signal }),
    enabled: Boolean(user) && canManage && showPipelineConfig
  });
  const [companyName, setCompanyName] = useState('');
  const [crmName, setCrmName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [defaultRange, setDefaultRange] = useState('This month');
  const [defaultPageSize, setDefaultPageSize] = useState('25');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    const company = settingsQuery.data?.data.company || {};
    setCompanyName(String(company.company_name || ''));
    setCrmName(String(company.crm_name || ''));
    setTimezone(String(company.timezone || ''));
    setDefaultRange(String(settingsQuery.data?.data.preferences?.default_dashboard_range || 'This month'));
    setDefaultPageSize(String(settingsQuery.data?.data.preferences?.default_table_page_size || '25'));
    setSenderName(String(settingsQuery.data?.data.emailAccess?.sender_name || ''));
    setSenderEmail(String(settingsQuery.data?.data.emailAccess?.sender_email || ''));
  }, [settingsQuery.data?.data.company]);

  async function saveCompany() {
    if (!companyName.trim()) { Alert.alert('Company name required', 'Enter a company name before saving.'); return; }
    setSavingCompany(true);
    try { await apiFetch('/api/settings/company', { method: 'PATCH', body: JSON.stringify({ company_name: companyName.trim(), crm_name: crmName.trim(), timezone: timezone.trim() }) }); await queryClient.invalidateQueries({ queryKey: ['workspace-settings'] }); Alert.alert('Settings saved', 'Company settings were updated on the CRM server.'); }
    catch (error) { Alert.alert('Unable to save settings', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSavingCompany(false); }
  }

  async function toggleNotification(item: NotificationSetting) {
    try { await apiFetch('/api/settings/notifications', { method: 'PATCH', body: JSON.stringify({ notifications: [{ event_key: item.event_key, in_app_enabled: !item.in_app_enabled }] }) }); await queryClient.invalidateQueries({ queryKey: ['settings-notifications'] }); }
    catch (error) { Alert.alert('Unable to update notification', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function savePreferences() {
    try { await apiFetch('/api/settings/preferences', { method: 'PATCH', body: JSON.stringify({ default_dashboard_range: defaultRange, default_table_page_size: Number(defaultPageSize) }) }); await queryClient.invalidateQueries({ queryKey: ['workspace-settings'] }); Alert.alert('Preferences saved', 'CRM defaults were updated.'); }
    catch (error) { Alert.alert('Unable to save preferences', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function saveEmailAccess() {
    try { await apiFetch('/api/settings/email-access', { method: 'PATCH', body: JSON.stringify({ sender_name: senderName.trim(), sender_email: senderEmail.trim() }) }); await queryClient.invalidateQueries({ queryKey: ['workspace-settings'] }); Alert.alert('Email settings saved', 'Access-email settings were updated.'); }
    catch (error) { Alert.alert('Unable to save email settings', error instanceof Error ? error.message : 'Please try again.'); }
  }

  if (!canManage) return <Screen><ErrorState message="Workspace Settings are available only to Super Admin users." /></Screen>;
  if (settingsQuery.isLoading || notificationsQuery.isLoading || permissionsQuery.isLoading || activitiesQuery.isLoading) return <LoadingState />;
  if (settingsQuery.isError || notificationsQuery.isError || permissionsQuery.isError || activitiesQuery.isError) return <Screen><ErrorState message="Workspace Settings could not load. Pull to refresh and try again." onRetry={() => { void Promise.all([settingsQuery.refetch(), notificationsQuery.refetch(), permissionsQuery.refetch(), activitiesQuery.refetch()]); }} /></Screen>;

  const settings = settingsQuery.data?.data || {};
  return <Screen refreshing={settingsQuery.isRefetching || notificationsQuery.isRefetching || permissionsQuery.isRefetching || activitiesQuery.isRefetching} onRefresh={() => { void Promise.all([settingsQuery.refetch(), notificationsQuery.refetch(), permissionsQuery.refetch(), activitiesQuery.refetch()]); }}>
    <PageTitle eyebrow="Administration" title="Settings" copy="Manage the same workspace configuration used by the web CRM." />
    <Card><Text style={styles.rowTitle}>Company profile</Text><TextInput value={companyName} onChangeText={setCompanyName} placeholder="Company name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={crmName} onChangeText={setCrmName} placeholder="CRM name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={timezone} onChangeText={setTimezone} placeholder="Timezone" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={savingCompany ? 'Saving…' : 'Save company settings'} onPress={() => { void saveCompany(); }} disabled={savingCompany} /></Card>

    <Card><Text style={styles.rowTitle}>CRM preferences</Text><TextInput value={defaultRange} onChangeText={setDefaultRange} placeholder="Default dashboard range" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={defaultPageSize} onChangeText={setDefaultPageSize} keyboardType="number-pad" placeholder="Default table page size" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.rowMeta}>Default lead status: {String(settings.preferences?.default_lead_status || 'Not configured')}</Text><Text style={styles.rowMeta}>Currency: {String(settings.company?.currency || settings.preferences?.default_currency || 'Not configured')}</Text><PrimaryButton label="Save CRM preferences" onPress={() => { void savePreferences(); }} /></Card>

    <Card><Text style={styles.rowTitle}>Security policy</Text><Text style={styles.rowMeta}>Temporary password expiry: {String(settings.security?.temporary_password_expiry_hours || 'Not configured')} hours</Text><Text style={styles.rowMeta}>Minimum password length: {String(settings.security?.minimum_password_length || 'Not configured')}</Text><Text style={styles.rowMeta}>Force password change: {settings.security?.force_password_change_first_login ? 'Enabled' : 'Disabled'}</Text><Text style={styles.rowMeta}>Required characters: uppercase, lowercase, number, special character</Text></Card>

    <Card><View style={styles.sectionHeader}><View style={styles.rowBody}><Text style={styles.rowTitle}>Pipeline and Android releases</Text><Text style={styles.rowMeta}>Load the same configuration and release visibility as the web workspace.</Text></View><SecondaryButton label={showPipelineConfig ? 'Hide' : 'Open'} onPress={() => setShowPipelineConfig(value => !value)} /></View></Card>
    {showPipelineConfig ? <>
      {pipelineQuery.isLoading || releasesQuery.isLoading ? <Card><Text style={styles.copy}>Loading pipeline configuration…</Text></Card> : pipelineQuery.isError || releasesQuery.isError ? <Card><ErrorState message="Pipeline configuration could not load." onRetry={() => { void Promise.all([pipelineQuery.refetch(), releasesQuery.refetch()]); }} /></Card> : <>
        <Card><Text style={styles.rowTitle}>Lead statuses</Text><Text style={styles.copy}>{(pipelineQuery.data?.leadStatuses || []).filter(item => item.is_active !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(item => item.name).filter(Boolean).join(' · ') || 'No statuses configured.'}</Text><Text style={styles.rowTitle}>Customer statuses</Text><Text style={styles.copy}>{(pipelineQuery.data?.customerStatuses || []).filter(item => item.is_active !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(item => item.name).filter(Boolean).join(' · ') || 'No customer statuses configured.'}</Text></Card>
        <Card><Text style={styles.rowTitle}>Lead tags and sources</Text><Text style={styles.copy}>Tags: {(pipelineQuery.data?.tags || []).filter(item => item.is_active !== false).map(item => item.name).filter(Boolean).join(' · ') || 'None configured.'}</Text><Text style={styles.copy}>Sources: {(pipelineQuery.data?.sources || []).filter(item => item.is_active !== false).map(item => item.name).filter(Boolean).join(' · ') || 'None configured.'}</Text></Card>
        <Card><Text style={styles.rowTitle}>Android app releases</Text>{(releasesQuery.data?.data || []).slice(0, 5).map((release, index) => <View key={release.id || `${release.versionCode}-${index}`} style={styles.noteRow}><Text style={styles.copy}>Version {release.versionName || 'Unknown'} · code {release.versionCode || '—'} · {release.status || 'draft'}</Text>{release.releaseNotes ? <Text style={styles.rowMeta}>{release.releaseNotes}</Text> : null}{release.downloadUrl ? <SecondaryButton label="Download APK" onPress={() => { void Linking.openURL(`${getApiBaseUrl()}${release.downloadUrl}`); }} /> : null}</View>)}{!releasesQuery.data?.data?.length ? <Text style={styles.copy}>No Android releases are available.</Text> : null}</Card>
      </>}
    </> : null}

    <Card><Text style={styles.rowTitle}>Email and access</Text><TextInput value={senderName} onChangeText={setSenderName} placeholder="Sender name" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={senderEmail} onChangeText={setSenderEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Sender email" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.rowMeta}>Email delivery: {settings.emailAccess?.email_enabled === false ? 'Disabled' : 'Enabled'}</Text><PrimaryButton label="Save email settings" onPress={() => { void saveEmailAccess(); }} /></Card>

    <Card><Text style={styles.rowTitle}>In-app notifications</Text>{(notificationsQuery.data?.data || []).map(item => <View key={item.event_key} style={styles.dashboardRow}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.event_name || item.event_key.replaceAll('_', ' ')}</Text><Text style={styles.rowMeta}>Show this event in the CRM notification center.</Text></View><Switch value={item.in_app_enabled !== false} onValueChange={() => { void toggleNotification(item); }} trackColor={{ false: colors.border, true: colors.goldPale }} thumbColor={item.in_app_enabled !== false ? colors.gold : colors.muted} /></View>)}</Card>

    <Card><Text style={styles.rowTitle}>Roles and permissions</Text>{(permissionsQuery.data?.data || []).slice(0, 20).map((item, index) => <Text key={`${item.role}-${item.key}-${index}`} style={styles.rowMeta}>{String(item.role || 'role').replaceAll('_', ' ')} · {item.key || 'permission'} · {item.allowed === false ? 'Denied' : 'Allowed'}</Text>)}<Text style={styles.copy}>Permissions remain enforced by the server for every API request.</Text></Card>

    <Card><Text style={styles.rowTitle}>Activity audit</Text>{(activitiesQuery.data?.data || []).slice(0, 12).map((item, index) => <View key={item.id || `${item.created_at}-${index}`} style={styles.noteRow}><Text style={styles.copy}>{item.description || item.action || 'Settings activity'}</Text><Text style={styles.rowMeta}>{item.actor_name || 'Aureum administrator'}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}</Text></View>)}{!activitiesQuery.data?.data?.length ? <Text style={styles.copy}>No settings activity is available.</Text> : null}</Card>
  </Screen>;
}
