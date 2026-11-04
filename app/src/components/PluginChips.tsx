import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useAppTranslation } from '../i18n';
import { pluginChipSlots } from '../plugins';
import type { GroupSummary } from '../protocol';
import { useStore } from '../store';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { BranchIcon, LinkIcon } from './Icons';

/**
 * Tags above the composer. Each conversation has a GitHub slot and a deploy slot.
 * A bound slot shows "label · detail" and opens plugin detail. An empty slot is
 * a connect button for that same slot.
 */
export function PluginChips({ group, onPress }: { group: GroupSummary; onPress(kind: 'repo' | 'deploy', bound: boolean): void }) {
  const { t } = useAppTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { integrations } = useStore();
  const slots = pluginChipSlots(group.binding, integrations);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      {slots.map((slot) => {
        const bound = slot.bound;
        const connectLabel = slot.kind === 'repo' ? t('plugins.chipConnectRepo') : t('plugins.chipConnectDeploy');
        const label = bound ? `${bound.label} · ${bound.detail}` : connectLabel;
        // The deploy chip stays short so both chips fit; the screen reader gets the full phrase.
        const accessibilityLabel = bound ? `${bound.label} ${bound.detail}` : slot.kind === 'repo' ? connectLabel : t('plugins.connectDeployTitle');
        return (
          <Pressable
            key={slot.kind}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={() => onPress(slot.kind, bound !== null)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            {slot.kind === 'repo' ? <BranchIcon size={16} /> : <LinkIcon size={16} color={colors.textSecondary} />}
            <Text style={styles.text} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  scroll: { flexGrow: 0 },
  // Match Composer wrap (paddingHorizontal: 14) so the first chip lines up with the bar’s left edge.
  row: { gap: 8, paddingHorizontal: 14, paddingBottom: 8, justifyContent: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 280,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  text: { flexShrink: 1, fontSize: 15, color: colors.text },
});
