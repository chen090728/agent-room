import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackIcon, LockIcon } from '../../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, RoundButton, ScreenHeader, SectionLabel } from '../../components/ui';
import { useStore } from '../../store';
import { colors } from '../../theme';

// Short, practical instructions for services that need a token.
const HELP: Record<string, string[]> = {
  github: [
    '1. 在 GitHub 网页打开 Settings → Developer settings → Personal access tokens → Fine-grained tokens，点 Generate new token。',
    '2. Repository access 选"Only select repositories"，勾选要给助手用的仓库。',
    '3. Permissions → Repository permissions 里，把 Contents 和 Pull requests 设为 Read and write。',
    '4. 生成后复制令牌（以 github_pat_ 开头），粘贴到下面。',
  ],
};

export default function NewIntegrationScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { api, integrationTypes, refreshIntegrations } = useStore();
  const info = integrationTypes.find((t) => t.type === type);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!info) refreshIntegrations().catch(() => {});
  }, [info, refreshIntegrations]);

  const missing = !info || info.fields.some((f) => f.required && !config[f.key]?.trim());

  const save = async () => {
    if (!api || !info) return;
    setBusy(true);
    setError(null);
    try {
      await api.createIntegration({ type: info.type, config });
      await refreshIntegrations();
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
          title={info ? `连接 ${info.label}` : '添加连接'}
          left={
            <RoundButton label="返回" onPress={() => router.back()}>
              <BackIcon />
            </RoundButton>
          }
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {info && (
            <>
              <Text style={styles.description}>{info.description}</Text>
              {HELP[info.type] && (
                <View style={styles.help}>
                  {HELP[info.type].map((line) => (
                    <Text key={line} style={styles.helpLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.section}>
                <SectionLabel>连接信息</SectionLabel>
                <Card>
                  {info.fields.map((f, i) => (
                    <FieldRow
                      key={f.key}
                      first={i === 0}
                      label={f.label}
                      value={config[f.key] ?? ''}
                      onChangeText={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
                      placeholder={f.placeholder}
                      secureTextEntry={f.kind === 'password'}
                      keyboardType={f.kind === 'url' ? 'url' : 'default'}
                      autoCapitalize="none"
                    />
                  ))}
                </Card>
                <View style={styles.note}>
                  <LockIcon />
                  <Text style={styles.noteText}>令牌加密保存在你的服务器上</Text>
                </View>
              </View>
            </>
          )}
          {!info && <Text style={styles.description}>加载中…</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton title="验证并保存" onPress={save} disabled={missing} busy={busy} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 20, gap: 22 },
  description: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, paddingHorizontal: 4 },
  help: { gap: 8, padding: 16, backgroundColor: colors.selected, borderRadius: 16 },
  helpLine: { fontSize: 13, lineHeight: 19, color: colors.text },
  section: { gap: 10 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  noteText: { fontSize: 12, color: colors.textSecondary },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
