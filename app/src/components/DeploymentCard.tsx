import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTranslation } from '../i18n';
import { renderNotice } from '../i18n/notice';
import type { DeploymentCard as Card } from '../protocol';
import { colors, shadows } from '../theme';
import { CheckIcon } from './Icons';

const GREEN = '#148A5A';
const RED = '#C73C40';

const STATE_COLOR: Record<Card['state'], string> = {
  queued: colors.textSecondary,
  building: colors.warning,
  ready: GREEN,
  error: RED,
};

const STATE_KEY: Record<Card['state'], string> = {
  queued: 'deployment.queued',
  building: 'deployment.building',
  ready: 'deployment.ready',
  error: 'deployment.failed',
};

/** Where a merged change is being deployed: platform, project, progress and the preview link. */
export function DeploymentCard({ card }: { card: Card }) {
  const { t, i18n } = useAppTranslation();
  const stateText = t(STATE_KEY[card.state]);
  const state = { text: stateText, color: STATE_COLOR[card.state] };
  const errorText = card.error ? renderNotice(card.errorNotice, card.error, t, (key) => i18n.exists(key)) : '';
  const open = () => {
    if (card.url && /^https?:\/\//i.test(card.url)) Linking.openURL(card.url).catch(() => {});
  };

  return (
    <View style={styles.card} accessibilityLabel={t('deployment.a11y', { platform: card.platformLabel, project: card.projectName, state: state.text })}>
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: state.color }]}>{card.state === 'ready' && <CheckIcon size={9} />}</View>
        <Text style={styles.platform} numberOfLines={1}>
          {card.platformLabel} · {card.projectName}
        </Text>
        <Text style={[styles.state, { color: state.color }]} numberOfLines={1}>
          {state.text}
        </Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {card.title}
      </Text>
      <Text style={styles.meta}>
        {card.branch} · {card.commit.slice(0, 7)}
      </Text>
      {card.state === 'error' && errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      {card.state === 'ready' && card.url ? (
        <Pressable accessibilityRole="link" accessibilityLabel={t('deployment.openPreview')} onPress={open} style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
          <Text style={styles.openText} numberOfLines={1}>
            {t('deployment.openPreview')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  platform: { flex: 1, minWidth: 0, fontSize: 12, color: colors.textSecondary },
  state: { flexShrink: 1, fontSize: 12, fontWeight: '500' },
  title: { fontSize: 14, lineHeight: 20, color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  error: { fontSize: 12.5, lineHeight: 18, color: RED },
  open: { alignSelf: 'flex-start', marginTop: 4, height: 36, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  openText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
