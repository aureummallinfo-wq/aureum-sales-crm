import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider } from '@/auth/session';
import { QueryProvider } from '@/lib/query-provider';
import { colors } from '@/theme';
import { AppErrorBoundary } from '@/components/app-error-boundary';

export default function RootLayout() {
  return <SafeAreaProvider><SafeAreaView edges={['top', 'bottom']} style={{ backgroundColor: colors.background, flex: 1 }}><AppErrorBoundary><QueryProvider><SessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></SessionProvider></QueryProvider></AppErrorBoundary></SafeAreaView></SafeAreaProvider>;
}
