import { useState } from 'react';
import { ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/auth/session';
import { colors, spacing } from '@/theme';

const loginBackground = require('../assets/login-background.png');

export default function LoginScreen() {
  const { login } = useSession();
  const { height } = useWindowDimensions();
  const compactLayout = height < 760;
  const heroHeight = compactLayout ? 170 : 205;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!identifier.trim() || !password) { setError('Enter your email or phone and password.'); return; }
    setError(''); setSaving(true);
    try { await login(identifier, password); router.replace('/(tabs)'); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); } finally { setSaving(false); }
  }

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[styles.scroll, compactLayout && styles.scrollCompact]} keyboardShouldPersistTaps="handled">
      <ImageBackground source={loginBackground} resizeMode="cover" style={[styles.hero, { height: heroHeight }]} imageStyle={styles.heroImage}>
        <View style={styles.heroShade} />
        <View style={styles.heroContent}>
          <Text style={styles.location}>✦ LAHORE · PAKISTAN</Text>
          <Text style={styles.brandPill}>AUREUM SALES CRM</Text>
          <Text style={styles.heroTitle}>Keep every customer relationship moving.</Text>
          <Text style={styles.heroCopy}>Leads, follow-ups, and team performance in one workspace.</Text>
        </View>
      </ImageBackground>

      <View style={[styles.formCard, compactLayout && styles.formCardCompact]}>
        <View style={styles.formBrand}>
          <Text style={styles.logoMark}>A<Text style={styles.logoAccent}>◒</Text></Text>
          <View><Text style={styles.formBrandName}>Aureum Sales CRM</Text><Text style={styles.formBrandSub}>SALES OPERATIONS PLATFORM</Text></View>
        </View>
        <Text style={styles.eyebrow}>SIGN IN TO CONTINUE</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.copy}>Sign in with your company credentials.</Text>

        <View style={styles.fields}>
          <Text style={styles.label}>Work email or phone</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} value={identifier} onChangeText={setIdentifier} placeholder="name@company.com" placeholderTextColor={colors.muted} style={styles.input} />
          <Text style={styles.label}>Password</Text>
          <TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor={colors.muted} style={styles.input} />
        </View>

        <Pressable disabled={saving} onPress={submit} style={[styles.button, saving && styles.buttonDisabled]}><Text style={styles.buttonText}>{saving ? 'Signing in…' : 'Sign in'}</Text></Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.notice}>Access is managed by your organization. Contact your administrator if you need help signing in.</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, backgroundColor: colors.background, paddingBottom: spacing.md },
  scrollCompact: { paddingBottom: spacing.sm },
  hero: { justifyContent: 'flex-end', overflow: 'hidden' },
  heroImage: { opacity: 0.92 },
  heroShade: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, backgroundColor: 'rgba(8, 13, 17, 0.64)' },
  heroContent: { gap: 6, paddingHorizontal: spacing.md, paddingBottom: 18, paddingTop: 28 },
  location: { color: colors.goldSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  brandPill: { alignSelf: 'flex-start', borderColor: colors.gold, borderRadius: 14, borderWidth: 1, color: colors.goldSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, paddingHorizontal: 9, paddingVertical: 5 },
  heroTitle: { color: '#FFF8EA', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: undefined }), fontSize: 24, fontWeight: '700', lineHeight: 28, maxWidth: 320 },
  heroCopy: { color: '#D5CEC2', fontSize: 11, lineHeight: 15, maxWidth: 320 },
  formCard: { backgroundColor: '#151D22', borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginHorizontal: spacing.md, marginTop: -10, padding: spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  formCardCompact: { padding: 14, marginTop: -8 },
  formBrand: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 },
  logoMark: { color: '#6C58FF', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: undefined }), fontSize: 28, fontWeight: '700' },
  logoAccent: { color: '#E8837E' },
  formBrandName: { color: '#FFF8EA', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: undefined }), fontSize: 17, fontWeight: '700' },
  formBrandSub: { color: colors.goldSoft, fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  eyebrow: { color: colors.goldSoft, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 5 },
  title: { color: '#FFF8EA', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: undefined }), fontSize: 26, fontWeight: '700', marginBottom: 4 },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  fields: { gap: 5 },
  label: { color: '#D8D0C4', fontSize: 11, fontWeight: '700', marginTop: 2 },
  input: { backgroundColor: '#242C31', borderColor: '#465057', borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 4 },
  button: { alignItems: 'center', backgroundColor: '#D5B35B', borderRadius: 10, marginTop: 8, padding: 13 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#171513', fontSize: 15, fontWeight: '800' },
  error: { backgroundColor: 'rgba(164, 55, 59, 0.28)', borderRadius: 7, color: '#FFB4B4', fontSize: 11, lineHeight: 15, marginTop: 8, paddingHorizontal: 9, paddingVertical: 6 },
  notice: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 8 }
});
