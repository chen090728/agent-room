import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackIcon, ChevronRightIcon, LinkIcon, LockIcon } from '../../components/Icons';
import { confirmAction, showMessage } from '../../dialogs';
import { Card, RoundButton, ScreenHeader, SectionLabel } from '../../components/ui';
import { useStore } from '../../store';
import { colors } from '../../theme';

/** Connections to outside services such as GitHub. */
export default function IntegrationsScreen() {
  const { api, integrations, integrationTypes, refreshIntegrations } = useStore();

  useEffect(() => {
    refreshIntegrations().catch(() => {});
  }, [refreshIntegrations]);

  const remove = async (id: string, name: string) => {
    const ok = await confirmAction({
      title: `删除「${name}」？`,
      message: '会同时解除所有用到它的对话的绑定。服务器上保存的令牌也会被删掉。',
      confirmText: '删除',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api?.deleteIntegration(id);
      await refreshIntegrations();
    } catch (e) {
      showMessage('删除失败', (e as Error).message);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title="连接"
        left={
          <RoundButton label="返回" onPress={() => router.back()}>
            <BackIcon />
          </RoundButton>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {integrations.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>已连接</SectionLabel>
            <Card>
              {integrations.map((i, idx) => (
                <View key={i.id} style={[styles.row, idx > 0 && styles.rowDivider]}>
                  <LinkIcon />
                  <View style={styles.text}>
                    <Text style={styles.name} numberOfLines={1}>
                      {i.name}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {i.typeLabel}
                      {i.secrets.token ? ` · 令牌 ${i.secrets.token}` : ''}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`删除 ${i.name}`} onPress={() => remove(i.id, i.name)} hitSlop={8}>
                    <Text style={styles.delete}>删除</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          </View>
        )}

        <View style={styles.section}>
          <SectionLabel>添加连接</SectionLabel>
          <Card>
            {integrationTypes.map((t, idx) => (
              <Pressable
                key={t.type}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/integrations/new', params: { type: t.type } })}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={styles.text}>
                  <Text style={styles.name}>{t.label}</Text>
                  <Text style={styles.sub}>{t.description}</Text>
                </View>
                <ChevronRightIcon />
              </Pressable>
            ))}
            {!integrationTypes.length && <Text style={styles.empty}>加载中…</Text>}
          </Card>
          <View style={styles.note}>
            <LockIcon />
            <Text style={styles.noteText}>令牌只保存在你的服务器上，这里只显示打码后的样子</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 40, gap: 26 },
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  delete: { fontSize: 13, color: colors.danger },
  empty: { padding: 16, fontSize: 13, color: colors.textSecondary },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  noteText: { fontSize: 12, color: colors.textSecondary },
});
