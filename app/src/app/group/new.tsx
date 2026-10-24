import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPersonIcon, CloseIcon } from '../../components/Icons';
import { MemberChecklist } from '../../components/MemberChecklist';
import { Card, ErrorText, FieldRow, PrimaryButton, RoundButton, ScreenHeader, SectionLabel } from '../../components/ui';
import { useStore } from '../../store';
import { colors } from '../../theme';

export default function NewGroupScreen() {
  const { api, members, upsertGroup } = useStore();
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
      router.dismissAll();
      router.navigate({ pathname: '/chat/[id]', params: { id: group.id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <ScreenHeader
          title="新建群聊"
          left={
            <RoundButton label="关闭" onPress={() => router.back()}>
              <CloseIcon />
            </RoundButton>
          }
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <FieldRow first label="群名" value={name} onChangeText={setName} placeholder="例如：产品讨论组" maxLength={40} />
          </Card>

          <View style={styles.section}>
            <SectionLabel>选择成员</SectionLabel>
            {members.length > 0 && <MemberChecklist members={members} selected={selected} onToggle={toggle} />}
            <Pressable accessibilityRole="button" onPress={() => router.push('/member/new')} style={styles.addRow}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 20, gap: 26 },
  section: { gap: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 48 },
  addText: { fontSize: 14, color: colors.text },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
