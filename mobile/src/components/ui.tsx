import { PropsWithChildren, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useSession } from '@/auth/session';
import { colors, spacing } from '@/theme';

export function Screen({ children, scroll = true, refreshing = false, onRefresh }: PropsWithChildren<{ scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }>) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const content = <View style={styles.screen}>{children}</View>;
  return <View style={styles.screenRoot}>
    <MobileTopBar onMenu={() => setDrawerOpen(true)} />
    {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} /> : undefined}>{content}</ScrollView> : content}
    <NavigationDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
  </View>;
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { user } = useSession();
  const notificationsQuery = useQuery({ queryKey: ['notifications'], queryFn: () => apiFetch<{ data: Array<{ id: string; is_read?: boolean }>; unread?: number }>('/api/notifications'), enabled: Boolean(user) });
  const unread = notificationsQuery.data?.unread ?? notificationsQuery.data?.data?.filter(item => !item.is_read).length ?? 0;
  const initials = String(user?.full_name || user?.email || 'A').split(/\s+/).slice(0, 2).map(item => item[0]).join('').toUpperCase();
  return <View style={styles.topBar}>
    <Pressable accessibilityLabel="Open navigation" hitSlop={8} onPress={onMenu} style={styles.topBarButton}><Text style={styles.topBarIcon}>☰</Text></Pressable>
    <View style={styles.topBarBrand}><Text style={styles.topBarEyebrow}>AUREUM CRM</Text><Text numberOfLines={1} style={styles.topBarTitle}>{user?.full_name || 'Workspace'}</Text></View>
    <View style={styles.topBarActions}>
      <Pressable accessibilityLabel="Open notifications" hitSlop={8} onPress={() => router.push('/notifications')} style={styles.topBarButton}><Text style={styles.topBarIcon}>♢</Text>{unread > 0 ? <View style={styles.notificationDot}><Text style={styles.notificationCount}>{unread > 9 ? '9+' : unread}</Text></View> : null}</Pressable>
      <Pressable accessibilityLabel="Open account" hitSlop={8} onPress={() => router.push('/(tabs)/account')} style={styles.avatar}><Text style={styles.avatarText}>{initials || 'A'}</Text></Pressable>
    </View>
  </View>;
}

function NavigationDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useSession();
  const role = String(user?.role || '').toLowerCase();
  const canSeeLeads = ['super_admin', 'sales_manager', 'sales_agent'].includes(role);
  const canSeeFollowUps = ['super_admin', 'sales_manager', 'sales_agent', 'hr'].includes(role);
  const links = [
    { label: 'Dashboard', route: '/(tabs)', visible: true },
    { label: role === 'sales_agent' ? 'My Leads' : 'Leads', route: '/(tabs)/leads', visible: canSeeLeads },
    { label: 'Customers', route: '/(tabs)/customers', visible: canSeeLeads },
    { label: 'Follow-ups', route: '/(tabs)/follow-ups', visible: canSeeFollowUps },
    { label: 'Tasks', route: '/(tabs)/tasks', visible: true },
    { label: 'Notifications', route: '/notifications', visible: true },
    { label: 'My Account', route: '/(tabs)/account', visible: true }
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.drawerLayer}>
      <Pressable accessibilityLabel="Close navigation" onPress={onClose} style={styles.drawerBackdrop} />
      <View style={styles.drawer}>
        <View style={styles.drawerHeader}><View><Text style={styles.drawerEyebrow}>AUREUM SALES CRM</Text><Text style={styles.drawerTitle}>Workspace</Text></View><Pressable accessibilityLabel="Close navigation" hitSlop={8} onPress={onClose} style={styles.drawerClose}><Text style={styles.drawerCloseText}>×</Text></Pressable></View>
        <View style={styles.drawerLinks}>{links.filter(item => item.visible).map(item => <Pressable key={item.route} onPress={() => { onClose(); router.replace(item.route as never); }} style={styles.drawerLink}><Text style={styles.drawerLinkText}>{item.label}</Text><Text style={styles.drawerChevron}>›</Text></Pressable>)}</View>
        <View style={styles.drawerFooter}><Text style={styles.drawerRole}>{String(user?.role || 'CRM user').replaceAll('_', ' ')}</Text><Text style={styles.drawerFooterText}>Connected to the Aureum workspace</Text></View>
      </View>
    </View>
  </Modal>;
}

export function PageTitle({ eyebrow, title, copy }: { eyebrow?: string; title: string; copy?: string }) {
  return <View style={styles.titleWrap}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.title}>{title}</Text>{copy ? <Text style={styles.copy}>{copy}</Text> : null}</View>;
}

export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }

export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <View style={[styles.card, styles.metricCard]}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricDetail}>{detail}</Text></View>;
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.buttonDisabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.secondaryButton, disabled && styles.buttonDisabled]}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

export function BackButton({ label = 'Back' }: { label?: string }) {
  return <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>‹</Text><Text style={styles.backButtonLabel}>{label}</Text></Pressable>;
}

export function LoadingState() { return <View style={styles.center}><ActivityIndicator color={colors.gold} /><Text style={styles.copy}>Loading CRM data…</Text></View>; }

export function ErrorState({ message }: { message: string }) { return <Card><Text style={styles.error}>{message}</Text></Card>; }

export const styles = StyleSheet.create({
  screenRoot: { backgroundColor: colors.background, flex: 1 },
  scroll: { flexGrow: 1 },
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  topBar: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 62, paddingHorizontal: spacing.md },
  topBarButton: { alignItems: 'center', height: 44, justifyContent: 'center', position: 'relative', width: 44 },
  topBarIcon: { color: colors.goldSoft, fontSize: 23, fontWeight: '700' },
  topBarBrand: { flex: 1, gap: 2, minWidth: 0 },
  topBarEyebrow: { color: colors.goldSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  topBarTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  topBarActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  notificationDot: { alignItems: 'center', backgroundColor: colors.danger, borderColor: colors.surface, borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 3, position: 'absolute', right: 0, top: 0 },
  notificationCount: { color: '#FFF8EA', fontSize: 9, fontWeight: '800' },
  avatar: { alignItems: 'center', backgroundColor: colors.gold, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  avatarText: { color: '#171513', fontSize: 12, fontWeight: '900' },
  drawerLayer: { flex: 1, flexDirection: 'row' },
  drawerBackdrop: { backgroundColor: 'rgba(0,0,0,0.62)', flex: 1 },
  drawer: { backgroundColor: colors.surface, borderRightColor: colors.border, borderRightWidth: 1, elevation: 16, maxWidth: 292, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, width: '82%' },
  drawerHeader: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing.md },
  drawerEyebrow: { color: colors.goldSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  drawerTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 4 },
  drawerClose: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  drawerCloseText: { color: colors.text, fontSize: 30, fontWeight: '300' },
  drawerLinks: { gap: 6, paddingTop: spacing.md },
  drawerLink: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 13 },
  drawerLinkText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  drawerChevron: { color: colors.goldSoft, fontSize: 23 },
  drawerFooter: { borderTopColor: colors.border, borderTopWidth: 1, gap: 4, marginTop: 'auto', paddingTop: spacing.md },
  drawerRole: { color: colors.goldSoft, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  drawerFooterText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  notificationUnread: { backgroundColor: 'rgba(198, 161, 91, 0.08)' },
  notificationMarker: { color: colors.goldSoft, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  titleWrap: { gap: 5, marginBottom: spacing.sm },
  eyebrow: { color: colors.goldSoft, fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.md, gap: 7 },
  metricCard: { flexBasis: '47%', flexGrow: 1, minWidth: 145 },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  metricValue: { color: colors.text, fontSize: 30, fontWeight: '800' },
  metricDetail: { color: colors.goldSoft, fontSize: 13 },
  button: { alignItems: 'center', backgroundColor: colors.gold, borderRadius: 12, padding: 14 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#171513', fontSize: 16, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryButtonText: { color: colors.goldSoft, fontSize: 13, fontWeight: '800' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 16, padding: 13 },
  noteInput: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 92, padding: 13, textAlignVertical: 'top' },
  noteRow: { borderTopColor: colors.border, borderTopWidth: 1, gap: 4, paddingTop: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterChip: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  filterChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  filterChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#171513' },
  actionStack: { gap: 6 },
  dashboardActions: { flexDirection: 'row', gap: 8 },
  dashboardPrimaryAction: { alignItems: 'center', backgroundColor: colors.gold, borderRadius: 11, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  dashboardPrimaryActionText: { color: '#171513', fontSize: 13, fontWeight: '900' },
  dashboardSecondaryAction: { alignItems: 'center', borderColor: colors.border, borderRadius: 11, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  dashboardSecondaryActionText: { color: colors.goldSoft, fontSize: 13, fontWeight: '800' },
  dashboardMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  dashboardRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 12 },
  dashboardRowChevron: { color: colors.goldSoft, fontSize: 24, fontWeight: '300' },
  backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, minHeight: 36, paddingRight: 8 },
  backButtonText: { color: colors.goldSoft, fontSize: 27, lineHeight: 29 },
  backButtonLabel: { color: colors.goldSoft, fontSize: 13, fontWeight: '800' },
  linkText: { color: colors.goldSoft, fontSize: 12, fontWeight: '800' },
  center: { alignItems: 'center', gap: 10, padding: spacing.xl },
  error: { color: colors.danger, lineHeight: 21 },
  row: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 13 },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowMeta: { color: colors.muted, fontSize: 13 },
  badge: { backgroundColor: colors.surfaceRaised, borderRadius: 20, color: colors.goldSoft, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 }
});
