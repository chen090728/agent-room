import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BridgeStatus, GroupSummary } from '../protocol';
import { useSheetClose } from '../sheets';
import { useStore } from '../store';
import { colors } from '../theme';
import { Blob } from './Avatar';
import { ChevronRightIcon } from './Icons';
import { Card, SectionLabel } from './ui';

/** The work assistants of a conversation, with whether their computer is connected. */
export function BridgeMembers({ group }: { group: GroupSummary }) {
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
      <SectionLabel>工作助手</SectionLabel>
      <Card>
        {workers.map((m, i) => {
          const s = statuses[m!.id];
          return (
            <Pressable
              key={m!.id}
              accessibilityRole="button"
              accessibilityLabel={`${m!.name}，连接电脑`}
              onPress={() => close(() => router.push({ pathname: '/member/pair', params: { memberId: m!.id } }))}
              style={[styles.row, i > 0 && styles.divider]}
            >
              <Blob avatar={m!.avatar} size={32} />
              <View style={styles.text}>
                <Text style={styles.name}>{m!.name}</Text>
                <Text style={[styles.sub, s?.online && styles.online]}>{s?.online ? '电脑已连接' : s?.paired ? '已配对，电脑没有在线' : '还没有配对电脑'}</Text>
              </View>
              <ChevronRightIcon />
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary },
  online: { color: '#148A5A' },
});
