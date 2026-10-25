import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AddPersonIcon } from '../components/Icons';
import { MemberChecklist } from '../components/MemberChecklist';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel } from '../components/ui';
import { useAppTranslation } from '../i18n';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { SheetHeader, SheetScrollView, useSheetClose, useSheets } from '../sheets';
import { useStore } from '../store';
import { colors } from '../theme';

/** Sheet: create a group chat. */
export function NewGroupSheet() {
  const { t } = useAppTranslation();
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
      <KeyboardAvoider style={styles.root}>
        <SheetHeader title={t('common.newGroup')} />
        <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <FieldRow first label={t('group.name')} value={name} onChangeText={setName} placeholder={t('group.namePlaceholder')} maxLength={40} />
          </Card>

          <View style={styles.section}>
            <SectionLabel>{t('group.members')}</SectionLabel>
            {members.length > 0 && <MemberChecklist members={members} selected={selected} onToggle={toggle} />}
            <Pressable accessibilityRole="button" onPress={() => sheets.open('member-new')} style={styles.addRow}>
              <AddPersonIcon size={20} />
              <Text style={styles.addText}>{t('common.newAssistant')}</Text>
            </Pressable>
          </View>
        </SheetScrollView>
        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton title={t('group.create')} onPress={create} disabled={!name.trim()} busy={busy} />
        </View>
      </KeyboardAvoider>
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
