import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/auth/session';
import { QueryProvider } from '@/lib/query-provider';
import { colors } from '@/theme';

export default function RootLayout() {
  return <QueryProvider><SessionProvider><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></SessionProvider></QueryProvider>;
}
