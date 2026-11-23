import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, TextInput, View, Pressable } from 'react-native';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingCard, PageTitle, Screen, styles } from '@/components/ui';
import { Customer, FollowUp, Lead } from '@/types/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { colors } from '@/theme';
import { useState } from 'react';

type SearchResponse = { data: { leads?: Lead[]; customers?: Customer[]; followUps?: FollowUp[] } };

export default function SearchScreen() {
  const { user } = useSession();
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebouncedValue(term, 250);
  const query = useQuery({ queryKey: ['global-search', user?.id, debouncedTerm], queryFn: ({ signal }) => apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(debouncedTerm)}`, { signal }), enabled: Boolean(user) && debouncedTerm.trim().length >= 2 });
  const results = query.data?.data;
  const hasResults = Boolean(results?.leads?.length || results?.customers?.length || results?.followUps?.length);

  return <Screen refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}>
    <PageTitle eyebrow="Workspace" title="Global search" copy="Search the records available to your signed-in CRM role." />
    <TextInput autoFocus value={term} onChangeText={setTerm} placeholder="Search leads, customers, or follow-ups" placeholderTextColor={colors.muted} style={styles.input} />
    {query.isLoading ? <LoadingCard label="Searching permitted CRM records…" /> : query.isError ? <ErrorState message="Search could not load. Pull to refresh and try again." onRetry={() => { void query.refetch(); }} /> : debouncedTerm.trim().length < 2 ? <Card><Text style={styles.copy}>Enter at least two characters to search the CRM.</Text></Card> : !hasResults ? <Card><Text style={styles.copy}>No permitted records match “{debouncedTerm}”.</Text></Card> : <>
      {results?.leads?.length ? <Card><Text style={styles.rowTitle}>Leads</Text>{results.leads.slice(0, 10).map(item => <Pressable key={item.id} style={styles.dashboardRow} onPress={() => router.push(`/lead/${item.id}`)}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.full_name}</Text><Text style={styles.rowMeta}>{item.status || 'New'} · {item.phone || item.email || 'No contact'}</Text></View><Text style={styles.dashboardRowChevron}>›</Text></Pressable>)}</Card> : null}
      {results?.customers?.length ? <Card><Text style={styles.rowTitle}>Customers</Text>{results.customers.slice(0, 10).map(item => <Pressable key={item.id} style={styles.dashboardRow} onPress={() => router.push(`/customer/${item.id}`)}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.full_name}</Text><Text style={styles.rowMeta}>{item.customer_status || item.status || 'Active'} · {item.phone || item.email || 'No contact'}</Text></View><Text style={styles.dashboardRowChevron}>›</Text></Pressable>)}</Card> : null}
      {results?.followUps?.length ? <Card><Text style={styles.rowTitle}>Follow-ups</Text>{results.followUps.slice(0, 10).map(item => <Pressable key={item.id} style={styles.dashboardRow} onPress={() => router.push(`/follow-up/${item.id}`)}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.customer_name || 'Customer'}</Text><Text style={styles.rowMeta}>{item.due_date || 'No date'} · {item.status || 'Pending'}</Text></View><Text style={styles.dashboardRowChevron}>›</Text></Pressable>)}</Card> : null}
    </>}
  </Screen>;
}
