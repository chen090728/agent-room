import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTranslation } from '../i18n';
import { CONNECTING_BANNER_DELAY_MS } from '../live';
import type { SocketStatus } from '../socket';
import { colors } from '../theme';

/**
 * Small top hint. Hidden while the socket is up, and for the first second it is down,
 * so a fast connect never covers the page.
 */
export function ConnectionBanner({ status }: { status: SocketStatus }) {
  const { t } = useAppTranslation();
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
  const label = status === 'offline' ? t('chat.reconnecting') : t('common.connecting');
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={[styles.text, status === 'offline' && styles.offline]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 2, paddingBottom: 4, paddingHorizontal: 24 },
  text: { flexShrink: 1, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  offline: { color: colors.warning },
});
