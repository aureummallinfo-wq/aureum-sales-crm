import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, getApiBaseUrl, setAccessToken, setRefreshHandler } from '@/api/client';
import { notificationDevicePlatform, registerForPushNotificationsAsync } from '@/notifications/push';
import { User } from '@/types/api';

const TOKEN_KEY = 'aureum.crm.mobile.access-token';

type AuthResponse = { accessToken: string; user: User };
type SessionContextValue = {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pushTokenRef = useRef('');
  const updatePromptedRef = useRef('');

  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await apiFetch<AuthResponse>('/api/auth/mobile/refresh', { method: 'POST', skipRefresh: true });
      await SecureStore.setItemAsync(TOKEN_KEY, response.accessToken);
      setAccessToken(response.accessToken);
      if (response.user) setUser(response.user);
      return response.accessToken;
    } catch (error) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setRefreshHandler(refreshAccessToken);
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) { if (active) setLoading(false); return; }
      setAccessToken(token);
      try {
        const response = await apiFetch<{ user: User }>('/api/auth/me');
        if (active) setUser(response.user);
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setAccessToken(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; setRefreshHandler(null); };
  }, [refreshAccessToken]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const openFromNotification = (response: Notifications.NotificationResponse | null) => {
      const route = response?.notification.request.content.data?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
    };
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    Notifications.getLastNotificationResponseAsync().then(response => { if (active) openFromNotification(response); }).catch(() => undefined);
    registerForPushNotificationsAsync().then(token => {
      if (!active || !token) return;
      pushTokenRef.current = token;
      return apiFetch('/api/mobile/push-tokens', {
        method: 'POST',
        body: JSON.stringify({ token, platform: notificationDevicePlatform(), device_name: Device.modelName || 'Mobile device', app_version: Constants.expoConfig?.version || '0.1.0' })
      });
    }).catch(() => undefined);
    return () => { active = false; receivedSubscription.remove(); responseSubscription.remove(); };
  }, [user]);

  useEffect(() => {
    if (!user || Platform.OS !== 'android') return;
    const installedVersionCode = Number(Constants.expoConfig?.android?.versionCode || 1);
    apiFetch<{ data: { versionName: string; versionCode: number; releaseNotes?: string; downloadUrl: string } | null }>('/api/app/releases/latest').then(response => {
      const release = response.data;
      if (!release || Number(release.versionCode) <= installedVersionCode || updatePromptedRef.current === String(release.versionCode)) return;
      updatePromptedRef.current = String(release.versionCode);
      Alert.alert(`Aureum CRM ${release.versionName} is available`, release.releaseNotes || 'A newer Android version is ready to install.', [{ text: 'Later', style: 'cancel' }, { text: 'Download update', onPress: () => { void Linking.openURL(`${getApiBaseUrl()}${release.downloadUrl}`); } }]);
    }).catch(() => undefined);
  }, [user]);

  const value = useMemo<SessionContextValue>(() => ({
    user,
    loading,
    async login(identifier, password) {
      const response = await apiFetch<AuthResponse>('/api/auth/mobile/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });
      await SecureStore.setItemAsync(TOKEN_KEY, response.accessToken);
      setAccessToken(response.accessToken);
      setRefreshHandler(refreshAccessToken);
      setUser(response.user);
    },
    async logout() {
      try {
        if (pushTokenRef.current) await apiFetch('/api/mobile/push-tokens', { method: 'DELETE', body: JSON.stringify({ token: pushTokenRef.current }) }).catch(() => undefined);
        await apiFetch('/api/auth/mobile/logout', { method: 'POST' });
      } finally {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setAccessToken(null);
        setRefreshHandler(null);
        pushTokenRef.current = '';
        setUser(null);
      }
    }
  }), [loading, refreshAccessToken, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
