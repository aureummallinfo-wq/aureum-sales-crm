import { Component, ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';

type Props = PropsWithChildren;
type State = { hasError: boolean; error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aureum CRM screen crashed:', error, info.componentStack);
  }

  retry = () => this.setState({ hasError: false, error: null });

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <View style={styles.root}>
      <Text style={styles.eyebrow}>AUREUM CRM</Text>
      <Text style={styles.title}>We need to reload this screen</Text>
      <Text style={styles.copy}>The CRM could not finish rendering this view. Your server data is safe. Try again, and contact your administrator if the problem continues.</Text>
      <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable>
      <Text style={styles.detail}>Reference: APP-RENDER-ERROR</Text>
    </View>;
  }
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: spacing.xl },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, fontFamily: 'serif', fontSize: 26, fontWeight: '800', marginTop: spacing.sm, textAlign: 'center' },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, maxWidth: 360, textAlign: 'center' },
  button: { backgroundColor: colors.gold, borderRadius: 12, marginTop: spacing.lg, paddingHorizontal: 24, paddingVertical: 13 },
  buttonText: { color: '#171513', fontSize: 15, fontWeight: '900' },
  detail: { color: colors.muted, fontSize: 11, marginTop: spacing.md, textAlign: 'center' }
});
