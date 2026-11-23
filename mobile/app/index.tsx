import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/auth/session';
import { colors } from '@/theme';

export default function Index() {
  const { user, loading } = useSession();
  if (loading) return <View style={{ alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.gold} /></View>;
  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}
