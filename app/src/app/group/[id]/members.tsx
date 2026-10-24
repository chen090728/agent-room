import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPersonIcon, BackIcon } from '../../../components/Icons';
import { MemberChecklist } from '../../../components/MemberChecklist';
import { ErrorText, PrimaryButton, RoundButton, ScreenHeader, SectionLabel } from '../../../components/ui';
import { useStore } from '../../../store';
import { colors } from '../../../theme';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, groups, members, upsertGroup } = useStore();
  const group = groups.find((g) => g.id === id);
  const current = group?.members.map((m) => m.id) ?? [];
  const [selected, setSelected] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up members added from the "新建助手" page while this screen is open.
  const currentKey = current.join(',');
  useEffect(() => {
    setSelected((s) => [...new Set([...s, ...currentKey.split(',').filter(Boolean)])]);
  }, [currentKey]);

  const toggle = (mid: string) => setSelected((s) => (s.includes(mid) ? s.filter((x) => x !== mid) : [...s, mid]));
  const changed = selected.length !== current.length || selected.some((m) => !current.includes(m));

  const save = async () => {
    if (!api || !group) return;
    setBusy(true);
    setError(null);
    try {
      upsertGroup(await api.setGroupMembers(group.id, selected));
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title={group ? group.name : '群成员'}
        left={
          <RoundButton label="返回" onPress={() => router.back()}>
            <BackIcon />
          </RoundButton>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionLabel>{`群成员 · 已选 ${selected.length} 位`}</SectionLabel>
          {members.length > 0 ? (
            <MemberChecklist members={members} selected={selected} onToggle={toggle} />
          ) : (
            <Text style={styles.empty}>还没有助手</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/member/new', params: { groupId: id } })}
            style={styles.addRow}
          >
            <AddPersonIcon size={20} />
            <Text style={styles.addText}>新建助手</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton title="保存" onPress={save} disabled={!changed} busy={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 20 },
  section: { gap: 10 },
  empty: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 48 },
  addText: { fontSize: 14, color: colors.text },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
