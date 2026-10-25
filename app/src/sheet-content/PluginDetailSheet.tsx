import { StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton } from '../components/ui';
import { confirmAction, showMessage } from '../dialogs';
import { useAppTranslation } from '../i18n';
import { boundPlugins } from '../plugins';
import { SheetHeader, useSheetClose, useSheets } from '../sheets';
import { useStore } from '../store';
import { colors } from '../theme';

/** Sheet: what a bound plugin does for this conversation, with a way to unbind or change it. */
export function PluginDetailSheet({ params }: { params: Record<string, string> }) {
  const { t } = useAppTranslation();
  const { api, groups, integrations, upsertGroup } = useStore();
  const close = useSheetClose();
  const sheets = useSheets();
  const group = groups.find((g) => g.id === params.groupId);
  const plugin = boundPlugins(group?.binding, integrations).find((p) => p.kind === params.kind);
  if (!group || !plugin) return <SheetHeader title={t('plugins.title')} />;

  const unbind = async () => {
    const ok = await confirmAction({
      title: plugin.kind === 'repo' ? t('pluginDetail.unbindRepoTitle') : t('pluginDetail.unbindDeployTitle'),
      message: plugin.kind === 'repo' ? t('pluginDetail.unbindRepoMessage') : t('pluginDetail.unbindDeployMessage'),
      confirmText: t('pluginDetail.unbind'),
      destructive: true,
    });
    if (!ok || !api) return;
    try {
      upsertGroup(await api.setBinding(group.id, { [plugin.kind]: null }));
      close();
    } catch (e) {
      showMessage(t('common.actionFailed'), (e as Error).message);
    }
  };

  return (
    <View style={styles.root}>
      <SheetHeader title={plugin.label} />
      <View style={styles.content}>
        <Card>
          <View style={styles.row}>
            <Text style={styles.label}>{plugin.kind === 'repo' ? t('pluginDetail.repo') : t('pluginDetail.project')}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {plugin.detail}
            </Text>
          </View>
        </Card>
        <Text style={styles.sub}>
          {plugin.kind === 'repo' ? t('pluginDetail.repoBody') : t('pluginDetail.deployBody')}
        </Text>
        <PrimaryButton title={t('common.change')} onPress={() => close(() => sheets.open('plugins', { groupId: group.id }))} />
        <Text accessibilityRole="button" onPress={unbind} style={styles.unbind}>
          {t('pluginDetail.unbind')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 12, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },
  label: { flexShrink: 1, fontSize: 14, color: colors.textSecondary },
  value: { flexShrink: 1, fontSize: 15, color: colors.text },
  sub: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingHorizontal: 4 },
  unbind: { textAlign: 'center', fontSize: 14, color: colors.danger, paddingVertical: 10 },
});
