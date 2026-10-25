import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DeploymentCard as Card } from '../protocol';
import { colors, shadows } from '../theme';
import { CheckIcon } from './Icons';

const GREEN = '#148A5A';
const RED = '#C73C40';

const STATE: Record<Card['state'], { text: string; color: string }> = {
  queued: { text: '排队中', color: colors.textSecondary },
  building: { text: '部署中', color: colors.warning },
  ready: { text: '已上线', color: GREEN },
  error: { text: '部署失败', color: RED },
};

/** Where a merged change is being deployed: platform, project, progress and the preview link. */
export function DeploymentCard({ card }: { card: Card }) {
  const state = STATE[card.state];
  const open = () => {
    if (card.url && /^https?:\/\//i.test(card.url)) Linking.openURL(card.url).catch(() => {});
  };

  return (
    <View style={styles.card} accessibilityLabel={`${card.platformLabel} 部署 ${card.projectName}：${state.text}`}>
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: state.color }]}>{card.state === 'ready' && <CheckIcon size={9} />}</View>
        <Text style={styles.platform} numberOfLines={1}>
          {card.platformLabel} · {card.projectName}
        </Text>
        <Text style={[styles.state, { color: state.color }]}>{state.text}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {card.title}
      </Text>
      <Text style={styles.meta}>
        {card.branch} · {card.commit.slice(0, 7)}
      </Text>
      {card.state === 'error' && card.error ? <Text style={styles.error}>{card.error}</Text> : null}
      {card.state === 'ready' && card.url ? (
        <Pressable accessibilityRole="link" accessibilityLabel="打开预览" onPress={open} style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
          <Text style={styles.openText}>打开预览</Text>
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
  state: { fontSize: 12, fontWeight: '500' },
  title: { fontSize: 14, lineHeight: 20, color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  error: { fontSize: 12.5, lineHeight: 18, color: RED },
  open: { alignSelf: 'flex-start', marginTop: 4, height: 36, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  openText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
