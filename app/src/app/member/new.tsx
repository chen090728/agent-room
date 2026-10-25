import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloseIcon, LockIcon } from '../../components/Icons';
import { AvatarPicker } from '../../components/AvatarPicker';
import { Card, ErrorText, FieldRow, PrimaryButton, RoundButton, ScreenHeader, SectionLabel, Switch } from '../../components/ui';
import { useStore } from '../../store';
import { colors, shadows, type Avatar } from '../../theme';

// The App's "chat assistant" with the mock switch off maps to this adapter;
// its input fields come from the server, so new fields need no App change.
const CHAT_ADAPTER = 'openai-compatible';

export default function NewMemberScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { api, adapters, groups, refreshGroups } = useStore();
  const group = groups.find((g) => g.id === groupId);

  const [avatar, setAvatar] = useState<Avatar>({ shape: 'cloud', color: 'teal' });
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [persona, setPersona] = useState('');
  const [mock, setMock] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [joinGroup, setJoinGroup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = adapters.find((a) => a.type === CHAT_ADAPTER)?.fields ?? [];
  const missing = !name.trim() || (!mock && fields.some((f) => f.required && !config[f.key]?.trim()));

  const create = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const member = await api.createMember({
        name: name.trim(),
        type: mock ? 'mock' : CHAT_ADAPTER,
        avatar,
        role: role.trim(),
        persona: persona.trim(),
        config: mock ? {} : config,
      });
      if (group && joinGroup) {
        await api.setGroupMembers(group.id, [...group.members.map((m) => m.id), member.id]);
        await refreshGroups();
      }
      router.back();
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
          title="新建助手"
          left={
            <RoundButton label="关闭" onPress={() => router.back()}>
              <CloseIcon />
            </RoundButton>
          }
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AvatarPicker value={avatar} onChange={setAvatar} />

          <Card>
            <FieldRow first label="名字" value={name} onChangeText={setName} placeholder="例如：小青" maxLength={20} />
            <FieldRow label="角色标签" value={role} onChangeText={setRole} placeholder="例如：产品经理" maxLength={20} />
            <FieldRow
              label="人设"
              value={persona}
              onChangeText={setPersona}
              placeholder="它是谁、怎么说话、擅长什么。比如：挑剔的审查员，发现问题就 @ 负责的人。"
              multiline
              maxLength={2000}
            />
          </Card>

          <View style={styles.section}>
            <SectionLabel>类型</SectionLabel>
            <View style={styles.segment}>
              <View style={[styles.segmentItem, styles.segmentOn]} accessibilityRole="button" accessibilityState={{ selected: true }}>
                <Text style={styles.segmentOnText}>聊天助手</Text>
              </View>
              <View style={styles.segmentItem} accessibilityRole="button" accessibilityState={{ disabled: true }}>
                <Text style={styles.segmentOffText}>工作助手 · 即将推出</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <SectionLabel
              right={
                <View style={styles.lockNote}>
                  <LockIcon />
                  <Text style={styles.lockText}>Key 只存在你的服务器</Text>
                </View>
              }
            >
              模型连接
            </SectionLabel>
            <Card>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>模拟助手</Text>
                  <Text style={styles.switchSub}>不需要 Key，先体验效果</Text>
                </View>
                <Switch label="模拟助手" value={mock} onChange={setMock} />
              </View>
              {!mock &&
                fields.map((f) =>
                  f.kind === 'boolean' ? (
                    <View key={f.key} style={[styles.switchRow, styles.switchDivider]}>
                      <View style={styles.switchText}>
                        <Text style={styles.switchTitle}>{f.label}</Text>
                        <Text style={styles.switchSub}>关闭后不会把图片发给这个模型</Text>
                      </View>
                      <Switch
                        label={f.label}
                        value={(config[f.key] ?? f.defaultValue ?? 'false') === 'true'}
                        onChange={(v) => setConfig((c) => ({ ...c, [f.key]: String(v) }))}
                      />
                    </View>
                  ) : (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    value={config[f.key] ?? ''}
                    onChangeText={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
                    placeholder={f.placeholder}
                    secureTextEntry={f.kind === 'password'}
                    keyboardType={f.kind === 'url' ? 'url' : 'default'}
                    autoCapitalize="none"
                    multiline={f.kind === 'textarea'}
                  />
                  ),
                )}
            </Card>
          </View>

          {group && group.kind === 'group' && (
            <Card>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>加入当前群聊</Text>
                  <Text style={styles.switchSub} numberOfLines={1}>
                    {group.name}
                  </Text>
                </View>
                <Switch label="加入当前群聊" value={joinGroup} onChange={setJoinGroup} />
              </View>
            </Card>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton title="创建助手" onPress={create} disabled={missing} busy={busy} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 20, gap: 26 },
  section: { gap: 10 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.selected, borderRadius: 16 },
  segmentItem: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface, boxShadow: shadows.segment },
  segmentOnText: { fontSize: 14, fontWeight: '500', color: colors.text },
  segmentOffText: { fontSize: 14, color: colors.textSecondary },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 12, color: colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 12 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 15, color: colors.text },
  switchSub: { fontSize: 12, color: colors.textSecondary },
  switchDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
