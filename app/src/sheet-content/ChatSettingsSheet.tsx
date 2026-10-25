import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BridgeMembers } from '../components/BridgeMembers';
import { AddPersonIcon } from '../components/Icons';
import { MemberChecklist } from '../components/MemberChecklist';
import { ErrorText, PrimaryButton, SectionLabel } from '../components/ui';
import { useAppTranslation } from '../i18n';
import { SheetHeader, SheetScrollView, useSheets } from '../sheets';
import { useStore } from '../store';
import { colors } from '../theme';

/** Sheet: the members of a group and the state of its work assistants. */
export function ChatSettingsSheet({ params }: { params: Record<string, string> }) {
  const { t } = useAppTranslation();
  const id = params.groupId;
  const { api, groups, members, upsertGroup } = useStore();
  const sheets = useSheets();
  const group = groups.find((g) => g.id === id);
  const isGroup = group?.kind === 'group';
  const current = group?.members.map((m) => m.id) ?? [];
  const [selected, setSelected] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up members added from the "新建助手" sheet while this one is open.
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <SheetHeader title={group ? group.name : t('chatSettings.title')} />
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {group && isGroup && (
          <View style={styles.section}>
            <SectionLabel>{t('chatSettings.members', { count: selected.length })}</SectionLabel>
            {members.length > 0 ? <MemberChecklist members={members} selected={selected} onToggle={toggle} /> : <Text style={styles.empty}>{t('chatSettings.noAssistants')}</Text>}
            <Pressable accessibilityRole="button" onPress={() => sheets.open('member-new', { groupId: id })} style={styles.addRow}>
              <AddPersonIcon size={20} />
              <Text style={styles.addText}>{t('common.newAssistant')}</Text>
            </Pressable>
            {changed && (
              <View style={styles.saveBox}>
                <ErrorText>{error}</ErrorText>
                <PrimaryButton title={t('chatSettings.saveMembers')} onPress={save} busy={busy} />
              </View>
            )}
          </View>
        )}
        {group && <BridgeMembers group={group} />}
        {group && !isGroup && !group.members.some((m) => members.find((x) => x.id === m.id)?.type === 'bridge') && (
          <Text style={styles.empty}>{t('chatSettings.directHint', { name: group.name })}</Text>
        )}
        {!group && <Text style={styles.empty}>{t('chatSettings.missing')}</Text>}
      </SheetScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40, gap: 28 },
  section: { gap: 10 },
  empty: { fontSize: 13, lineHeight: 20, color: colors.textSecondary, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 48 },
  addText: { fontSize: 14, color: colors.text },
  saveBox: { gap: 10, paddingTop: 4 },
});
