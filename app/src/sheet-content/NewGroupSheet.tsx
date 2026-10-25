import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AddPersonIcon } from '../components/Icons';
import { MemberChecklist } from '../components/MemberChecklist';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel } from '../components/ui';
import { SheetHeader, useSheetClose, useSheets } from '../sheets';
import { useStore } from '../store';
import { colors } from '../theme';

/** Sheet: create a group chat. */
export function NewGroupSheet() {
  const { api, members, upsertGroup } = useStore();
  const close = useSheetClose();
  const sheets = useSheets();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const group = await api.createGroup(name.trim(), selected);
      upsertGroup(group);
      close(() => router.navigate({ pathname: '/chat/[id]', params: { id: group.id } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <SheetHeader title="新建群聊" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <FieldRow first label="群名" value={name} onChangeText={setName} placeholder="例如：产品讨论组" maxLength={40} />
          </Card>

          <View style={styles.section}>
            <SectionLabel>选择成员</SectionLabel>
            {members.length > 0 && <MemberChecklist members={members} selected={selected} onToggle={toggle} />}
            <Pressable accessibilityRole="button" onPress={() => sheets.open('member-new')} style={styles.addRow}>
              <AddPersonIcon size={20} />
              <Text style={styles.addText}>新建助手</Text>
            </Pressable>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton title="创建群聊" onPress={create} disabled={!name.trim()} busy={busy} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20, gap: 26 },
  section: { gap: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 48 },
  addText: { fontSize: 14, color: colors.text },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
