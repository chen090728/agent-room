import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { boundPlugins } from '../plugins';
import type { GroupSummary } from '../protocol';
import { useStore } from '../store';
import { colors } from '../theme';
import { BranchIcon, LinkIcon } from './Icons';

/** Small tags above the input box for the plugins bound to this conversation. Tap one to view or unbind it. */
export function PluginChips({ group, onPress }: { group: GroupSummary; onPress(kind: 'repo' | 'deploy'): void }) {
  const { integrations } = useStore();
  const bound = boundPlugins(group.binding, integrations);
  if (!bound.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      {bound.map((p) => (
        <Pressable key={p.kind} accessibilityRole="button" accessibilityLabel={`${p.label} ${p.detail}`} onPress={() => onPress(p.kind)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
          {p.kind === 'repo' ? <BranchIcon size={13} /> : <LinkIcon size={13} color={colors.textSecondary} />}
          <Text style={styles.text} numberOfLines={1}>
            {p.label} · {p.detail}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingHorizontal: 18, paddingBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 240,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  text: { flexShrink: 1, fontSize: 12, color: colors.text },
});
