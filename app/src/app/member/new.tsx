import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloseIcon, LockIcon } from '../../components/Icons';
import { Orb, OrbPreview } from '../../components/Orb';
import { Card, ErrorText, FieldRow, PrimaryButton, RoundButton, ScreenHeader, SectionLabel, Switch } from '../../components/ui';
import { useStore } from '../../store';
import { colors, ORB_COLORS, orbPalette, shadows, type OrbColor } from '../../theme';

// The App's "chat assistant" with the mock switch off maps to this adapter;
// its input fields come from the server, so new fields need no App change.
const CHAT_ADAPTER = 'openai-compatible';

export default function NewMemberScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { api, adapters, groups, refreshGroups } = useStore();
  const group = groups.find((g) => g.id === groupId);

  const [color, setColor] = useState<OrbColor>('purple');
  const [name, setName] = useState('');
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
        color,
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
          <View style={styles.avatar}>
            <OrbPreview color={color} />
            <View style={styles.swatches}>
              {ORB_COLORS.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={orbPalette[c].label}
                  accessibilityState={{ selected: c === color }}
                  onPress={() => setColor(c)}
                  style={[styles.swatch, c === color && styles.swatchOn]}
                >
                  <Orb color={c} size={28} />
                </Pressable>
              ))}
            </View>
          </View>

          <Card>
            <FieldRow first label="名字" value={name} onChangeText={setName} placeholder="例如：小紫" maxLength={20} />
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
                fields.map((f) => (
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
                ))}
            </Card>
          </View>

          {group && (
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
  avatar: { alignItems: 'center', gap: 22 },
  swatches: { flexDirection: 'row', gap: 14 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchOn: { borderColor: colors.text },
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
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
