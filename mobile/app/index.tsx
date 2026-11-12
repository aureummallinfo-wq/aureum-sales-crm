import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/ui';
import { useSession } from '@/auth/session';

export default function Index() {
  const { user, loading } = useSession();
  if (loading) return <LoadingState />;
  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
