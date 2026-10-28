import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTranslation } from '../i18n';
import type { BridgeStatus, GroupSummary } from '../protocol';
import { useSheetClose } from '../sheets';
import { useStore } from '../store';
import { useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { Blob } from './Avatar';
import { ChevronRightIcon } from './Icons';
import { Card, SectionLabel } from './ui';

/** The work assistants of a conversation, with whether their computer is connected. */
export function BridgeMembers({ group }: { group: GroupSummary }) {
  const { t } = useAppTranslation();
  const styles = useThemedStyles(createStyles);
  const { api, members } = useStore();
  const close = useSheetClose();
  const workers = group.members.map((m) => members.find((x) => x.id === m.id)).filter((m) => m?.type === 'bridge');
  const [statuses, setStatuses] = useState<Record<string, BridgeStatus>>({});
  const key = workers.map((m) => m!.id).join(',');

  useEffect(() => {
    if (!api || !key) return;
    let cancelled = false;
    const load = () =>
      Promise.all(key.split(',').map(async (id) => [id, await api.bridgeStatus(id)] as const))
        .then((all) => !cancelled && setStatuses(Object.fromEntries(all)))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [api, key]);

  if (!workers.length) return null;
  return (
    <View style={styles.root}>
      <SectionLabel>{t('bridge.workAssistant')}</SectionLabel>
      <Card>
        {workers.map((m, i) => {
          const s = statuses[m!.id];
          return (
            <Pressable
              key={m!.id}
              accessibilityRole="button"
              accessibilityLabel={t('bridge.connectA11y', { name: m!.name })}
              onPress={() => close(() => router.push({ pathname: '/member/pair', params: { memberId: m!.id } }))}
              style={[styles.row, i > 0 && styles.divider]}
            >
              <Blob avatar={m!.avatar} size={32} />
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>{m!.name}</Text>
                <Text style={[styles.sub, s?.online && styles.online]} numberOfLines={2}>{s?.online ? t('bridge.online') : s?.paired ? t('bridge.pairedOffline') : t('bridge.notPairedShort')}</Text>
              </View>
              <ChevronRightIcon />
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary },
  online: { color: colors.success },
});
