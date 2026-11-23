import { useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, DateRangeControls, ErrorState, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';
import { ApiList, Lead } from '@/types/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { dateRangeBounds, dateRangeReady, DateRangeValue } from '@/lib/date-range';

const statusFilters = ['All', 'New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'];

type ImportRow = Record<string, string | number>;

function parseCsv(text: string): ImportRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { row.push(value.trim()); value = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value.trim()); value = '';
      if (row.some(item => item)) rows.push(row);
      row = [];
      continue;
    }
    value += character;
  }
  row.push(value.trim());
  if (row.some(item => item)) rows.push(row);
  if (rows.length < 2) return [];
  const aliases: Record<string, string> = { fullname: 'full_name', name: 'full_name', phonenumber: 'phone', mobile: 'phone', emailaddress: 'email', interest: 'interested_in', interestedin: 'interested_in', leadsource: 'lead_source', assignedagentid: 'assigned_agent_id', whatsapp: 'whatsapp_number', propertytype: 'property_type', preferredlocation: 'preferred_location', buyingtimeline: 'buying_timeline', financingrequired: 'financing_required' };
  const headers = rows[0].map((header, index) => aliases[header.toLowerCase().replace(/[^a-z0-9]/g, '')] || header.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_') || `column_${index + 1}`);
  return rows.slice(1).map((cells, index) => headers.reduce<ImportRow>((result, header, cellIndex) => { result[header] = cells[cellIndex] || ''; return result; }, { __row_number: index + 2 }));
}

export function LeadsScreen({ myOnly = false }: { myOnly?: boolean }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignedAgentId, setAssignedAgentId] = useState('');
  const [importing, setImporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const role = String(user?.role || '').toLowerCase();
  const canCreate = ['super_admin', 'sales_manager', 'sales_agent'].includes(role);
  const canViewLeads = ['super_admin', 'sales_manager', 'sales_agent'].includes(role);
  const canBulkAssign = ['super_admin', 'sales_manager'].includes(role) && !myOnly;
  const bounds = dateRangeBounds(dateRange, appliedStart, appliedEnd);
  const rangeReady = dateRangeReady(dateRange, appliedStart, appliedEnd);
  const agentsQuery = useQuery({ queryKey: ['agents', role], queryFn: ({ signal }) => apiFetch<{ data: Array<{ id: string; full_name?: string; fullName?: string; name?: string }> }>('/api/agents', { signal }), enabled: canBulkAssign });
  const basePath = myOnly || role === 'sales_agent' ? '/api/leads/my' : '/api/leads';
  const query = useInfiniteQuery({
    queryKey: ['leads', user?.id, user?.role, myOnly, debouncedSearch, status, dateRange, appliedStart, appliedEnd],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: '25' });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (status !== 'All') params.set('status', status);
      if (bounds) { params.set('dateFrom', bounds.start); params.set('dateTo', bounds.end); }
      return apiFetch<ApiList<Lead>>(`${basePath}?${params.toString()}`, { signal });
    },
    getNextPageParam: lastPage => lastPage.meta?.hasNextPage ? (lastPage.meta.page || 1) + 1 : undefined,
    placeholderData: keepPreviousData,
    enabled: Boolean(user) && canViewLeads && rangeReady
  });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <Screen><ErrorState message="The lead registry could not load." onRetry={() => { void query.refetch(); }} /></Screen>;
  const leads = query.data?.pages.flatMap(page => page.data) || [];
  const total = query.data?.pages[0]?.meta?.total ?? leads.length;

  if (!canViewLeads) return <Screen><ErrorState message="Leads are not available for this CRM role." /></Screen>;

  function toggleSelected(id: string) { setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  function updateDateRange(next: { value?: DateRangeValue; customStart?: string; customEnd?: string }) {
    if (next.value) { setDateRange(next.value); if (next.value !== 'custom') { setAppliedStart(''); setAppliedEnd(''); } else { setAppliedStart(''); setAppliedEnd(''); } }
    if (next.customStart !== undefined) setCustomStart(next.customStart);
    if (next.customEnd !== undefined) setCustomEnd(next.customEnd);
  }
  function applyCustomRange() {
    const next = dateRangeBounds('custom', customStart, customEnd);
    if (!next) { Alert.alert('Check dates', 'Enter valid start and end dates in YYYY-MM-DD format.'); return; }
    setAppliedStart(next.start); setAppliedEnd(next.end);
  }
  function toggleAllVisible() { setSelectedIds(current => current.length === leads.length ? [] : leads.map(item => item.id)); }
  async function assignSelected() {
    if (!selectedIds.length || !assignedAgentId) { Alert.alert('Choose assignment', 'Select at least one lead and an active advisor.'); return; }
    try { await apiFetch('/api/leads/bulk-assign', { method: 'PATCH', body: JSON.stringify({ lead_ids: selectedIds, assigned_agent_id: assignedAgentId }) }); setSelectedIds([]); setAssignedAgentId(''); await Promise.all([queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); Alert.alert('Leads assigned', `${selectedIds.length} lead${selectedIds.length === 1 ? '' : 's'} assigned successfully.`); }
    catch (error) { Alert.alert('Unable to assign leads', error instanceof Error ? error.message : 'Please try again.'); }
  }
  async function importRows(rows: ImportRow[]) {
    setImporting(true);
    try {
      const result = await apiFetch<{ data: { imported: number; skippedCount: number; failedCount: number } }>('/api/leads/import', { method: 'POST', body: JSON.stringify({ rows, duplicate_mode: 'skip' }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]);
      Alert.alert('Import complete', `${result.data.imported} imported · ${result.data.skippedCount} skipped · ${result.data.failedCount} failed.`);
    } catch (error) { Alert.alert('Import failed', error instanceof Error ? error.message : 'Please check the file and try again.'); }
    finally { setImporting(false); }
  }
  async function chooseImportFile() {
    if (importing) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      let csv = '';
      if (/\.(xlsx|xls)$/i.test(asset.name || '')) {
        const fileBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        const parsed = await apiFetch<{ data: { csv?: string } }>('/api/leads/import/parse', { method: 'POST', body: JSON.stringify({ file_name: asset.name, file_base64: fileBase64 }) });
        csv = parsed.data.csv || '';
      } else {
        csv = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      const rows = parseCsv(csv);
      if (!rows.length) { Alert.alert('Empty import', 'The file needs a header row and at least one lead row.'); return; }
      if (rows.length > 250) { Alert.alert('Import limit', 'Import up to 250 leads at a time.'); return; }
      const requiredColumns = ['full_name', 'phone', 'interested_in'].filter(column => Object.prototype.hasOwnProperty.call(rows[0], column));
      if (requiredColumns.length < 3) { Alert.alert('Check the headers', 'The CSV must include Full Name, Phone, and Interested In columns.'); return; }
      Alert.alert('Review import', `${rows.length} lead${rows.length === 1 ? '' : 's'} ready from ${asset.name || 'the selected file'}. Duplicate leads will be skipped.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Import', onPress: () => { void importRows(rows); } }]);
    } catch (error) { Alert.alert('File could not be read', error instanceof Error ? error.message : 'Choose a valid CSV or Excel file.'); }
  }
  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Pipeline" title={myOnly || role === 'sales_agent' ? 'My Leads' : 'All Leads'} copy={`${total} permitted records`} />
    {canCreate ? <View><PrimaryButton label="+ Add new lead" onPress={() => router.push('/lead/new')} /><SecondaryButton label={importing ? 'Preparing import…' : 'Import CSV / Excel'} onPress={() => { void chooseImportFile(); }} disabled={importing} /></View> : null}
     <Card><TextInput autoCapitalize="none" value={search} onChangeText={setSearch} placeholder="Search name, phone, email…" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.filterRow}>{statusFilters.map(item => <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filterChip, status === item && styles.filterChipActive]}><Text style={[styles.filterChipText, status === item && styles.filterChipTextActive]}>{item}</Text></Pressable>)}</View>{search || status !== 'All' || dateRange !== 'all' ? <SecondaryButton label="Clear filters" onPress={() => { setSearch(''); setStatus('All'); updateDateRange({ value: 'all' }); }} /> : null}</Card>
     <DateRangeControls value={dateRange} customStart={customStart} customEnd={customEnd} onChange={updateDateRange} onApply={applyCustomRange} applyDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)} />
    {canBulkAssign ? <Card><View style={styles.sectionHeader}><Text style={styles.rowTitle}>Bulk assignment</Text><Text style={styles.rowMeta}>{selectedIds.length} selected</Text></View><SecondaryButton label={selectedIds.length === leads.length && leads.length ? 'Clear visible selection' : 'Select all visible'} onPress={toggleAllVisible} /><View style={styles.filterRow}>{(agentsQuery.data?.data || []).map(agent => { const label = agent.full_name || agent.fullName || agent.name || 'Advisor'; return <SecondaryButton key={agent.id} label={label} active={assignedAgentId === agent.id} onPress={() => setAssignedAgentId(agent.id)} />; })}</View><PrimaryButton label="Assign selected leads" onPress={() => { void assignSelected(); }} disabled={!selectedIds.length || !assignedAgentId} /></Card> : null}
     {!rangeReady ? <Card><Text style={styles.copy}>Apply both custom dates to load this view.</Text></Card> : <Card>{leads.map(lead => <View key={lead.id} style={styles.row}><Pressable accessibilityRole="button" style={styles.rowBody} onPress={() => router.push(`/lead/${lead.id}`)}><ViewBody lead={lead} /></Pressable>{canBulkAssign ? <SecondaryButton label={selectedIds.includes(lead.id) ? 'Selected' : 'Select'} active={selectedIds.includes(lead.id)} onPress={() => toggleSelected(lead.id)} /> : null}</View>)}{!leads.length ? <Text style={styles.copy}>No leads match the selected filters.</Text> : null}{query.hasNextPage ? <SecondaryButton label={query.isFetchingNextPage ? 'Loading…' : 'Load more leads'} onPress={() => { void query.fetchNextPage(); }} disabled={query.isFetchingNextPage} /> : null}</Card>}
  </Screen>;
}

export default function LeadsScreenRoute() { return <LeadsScreen />; }

function ViewBody({ lead }: { lead: Lead }) { return <View style={styles.rowBody}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={styles.rowTitle}>{lead.full_name}</Text><Text style={styles.badge}>{lead.status || 'New'}</Text></View><Text style={styles.rowMeta}>{`${lead.interested_in || 'Requirement pending'} · ${lead.assigned_agent || 'Unassigned'}`}</Text><Text style={styles.rowMeta}>{lead.phone || lead.email || 'No contact details'}</Text></View>; }
