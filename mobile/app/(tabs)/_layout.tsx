import { Tabs } from 'expo-router';
import { colors } from '@/theme';
import { useSession } from '@/auth/session';

export default function TabsLayout() {
  const { user } = useSession();
  const role = String(user?.role || '').toLowerCase();
  const canSeeLeads = ['super_admin', 'sales_manager', 'sales_agent'].includes(role);
  const canSeeCustomers = canSeeLeads;
  const canSeeFollowUps = ['super_admin', 'sales_manager', 'sales_agent', 'hr'].includes(role);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="leads" options={{ title: role === 'sales_agent' ? 'My Leads' : 'Leads', href: canSeeLeads ? undefined : null }} />
      <Tabs.Screen name="my-leads" options={{ title: 'My Leads', href: null }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', href: canSeeCustomers ? undefined : null }} />
      <Tabs.Screen name="follow-ups" options={{ title: 'Follow-ups', href: canSeeFollowUps ? undefined : null }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', href: null }} />
      <Tabs.Screen name="users" options={{ title: 'Users', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
