import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CONNECTING_BANNER_DELAY_MS } from '../live';
import type { SocketStatus } from '../socket';
import { useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';

/**
 * Small top hint. Hidden while the socket is up, and for the first second it is down,
 * so a fast connect never covers the page. Strings live here for later translation.
 */
export function ConnectionBanner({ status }: { status: SocketStatus }) {
  const styles = useThemedStyles(createStyles);
  const pending = status !== 'online';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), CONNECTING_BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!visible) return null;
  const label = status === 'offline' ? '与服务器断开，正在重连…' : '连接中…';
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={[styles.text, status === 'offline' && styles.offline]}>{label}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 2, paddingBottom: 4 },
  text: { fontSize: 12, color: colors.textSecondary },
  offline: { color: colors.warning },
});
