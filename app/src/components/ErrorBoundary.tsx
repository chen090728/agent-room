import * as Updates from 'expo-updates';
import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recordError } from '../errorLog';
import { useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';

interface State {
  error: Error | null;
}

/**
 * Shows an error page instead of a blank or closing App when rendering fails.
 * The error is also saved, so the settings can show it after a restart.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    recordError(error, 'render');
  }

  private reload = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Not available (e.g. in development); try rendering again instead.
      this.setState({ error: null });
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback error={error} onReload={() => void this.reload()} onRetry={() => this.setState({ error: null })} />;
  }
}

function ErrorFallback({ error, onReload, onRetry }: { error: Error; onReload: () => void; onRetry: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>出错了</Text>
      <Text style={styles.text}>App 遇到了一个问题。可以截图这一页发给开发者，然后点"重新加载"。</Text>
      <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
        <Text style={styles.message} selectable>
          {error.message}
        </Text>
        <Text style={styles.stack} selectable>
          {(error.stack ?? '').split('\n').slice(0, 12).join('\n')}
        </Text>
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={onReload} style={styles.button}>
        <Text style={styles.buttonText}>重新加载</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.secondary}>
        <Text style={styles.secondaryText}>再试一次</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22, paddingTop: 90, paddingBottom: 40, gap: 14 },
  title: { fontSize: 22, fontWeight: '600', color: colors.text },
  text: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  box: { flexGrow: 0, maxHeight: 340, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  boxContent: { padding: 14, gap: 10 },
  message: { fontSize: 14, lineHeight: 20, color: colors.danger },
  stack: { fontSize: 11, lineHeight: 16, color: colors.textSecondary, fontFamily: 'monospace' },
  button: { height: 50, borderRadius: 25, backgroundColor: colors.button, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.buttonText, fontSize: 16, fontWeight: '600' },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, color: colors.text },
});
