import { StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton } from '../components/ui';
import { confirmAction, showMessage } from '../dialogs';
import { boundPlugins } from '../plugins';
import { SheetHeader, useSheetClose, useSheets } from '../sheets';
import { useStore } from '../store';
import { useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';

/** Sheet: what a bound plugin does for this conversation, with a way to unbind or change it. */
export function PluginDetailSheet({ params }: { params: Record<string, string> }) {
  const styles = useThemedStyles(createStyles);
  const { api, groups, integrations, upsertGroup } = useStore();
  const close = useSheetClose();
  const sheets = useSheets();
  const group = groups.find((g) => g.id === params.groupId);
  const plugin = boundPlugins(group?.binding, integrations).find((p) => p.kind === params.kind);
  if (!group || !plugin) return <SheetHeader title="插件" />;

  const unbind = async () => {
    const ok = await confirmAction({
      title: plugin.kind === 'repo' ? '解除仓库绑定？' : '不再跟踪部署？',
      message: plugin.kind === 'repo' ? '助手之后就不能再读取这个仓库了。' : '合并之后群里不会再显示部署进度。',
      confirmText: '解除绑定',
      destructive: true,
    });
    if (!ok || !api) return;
    try {
      upsertGroup(await api.setBinding(group.id, { [plugin.kind]: null }));
      close();
    } catch (e) {
      showMessage('操作失败', (e as Error).message);
    }
  };

  return (
    <View style={styles.root}>
      <SheetHeader title={plugin.label} />
      <View style={styles.content}>
        <Card>
          <View style={styles.row}>
            <Text style={styles.label}>{plugin.kind === 'repo' ? '代码仓库' : '部署项目'}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {plugin.detail}
            </Text>
          </View>
        </Card>
        <Text style={styles.sub}>
          {plugin.kind === 'repo'
            ? '这个对话里的助手可以读取这个仓库，并通过 PR 提交修改；PR 要你点"同意合并"才会合并。'
            : '你在聊天里合并修改后，群里会显示这个项目的部署进度和预览链接。'}
        </Text>
        <PrimaryButton title="更换" onPress={() => close(() => sheets.open('plugins', { groupId: group.id }))} />
        <Text accessibilityRole="button" onPress={unbind} style={styles.unbind}>
          解除绑定
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 12, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },
  label: { fontSize: 14, color: colors.textSecondary },
  value: { flexShrink: 1, fontSize: 15, color: colors.text },
  sub: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingHorizontal: 4 },
  unbind: { textAlign: 'center', fontSize: 14, color: colors.danger, paddingVertical: 10 },
});
