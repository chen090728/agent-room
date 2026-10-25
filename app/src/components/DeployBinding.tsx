import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmAction, showMessage } from '../dialogs';
import type { GroupSummary, ResourceInfo } from '../protocol';
import { useStore } from '../store';
import { colors } from '../theme';
import { ChevronRightIcon, LinkIcon } from './Icons';
import { Card, SectionLabel } from './ui';

/** Integration types that can host a deployment. */
export const DEPLOY_TYPES = ['cloudflare-pages', 'vercel', 'netlify', 'render'];

/** Chooses where a merged change is deployed, so the chat can show the progress and preview link. */
export function DeployBinding({ group }: { group: GroupSummary }) {
  const { api, integrations, refreshIntegrations, upsertGroup } = useStore();
  const bound = group.binding?.deploy;
  const [picking, setPicking] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<ResourceInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshIntegrations().catch(() => {});
  }, [refreshIntegrations]);

  const platforms = integrations.filter((i) => DEPLOY_TYPES.includes(i.type));
  const current = platforms.find((i) => i.id === (integrationId ?? bound?.integrationId)) ?? platforms[0];
  const boundIntegration = integrations.find((i) => i.id === bound?.integrationId);

  useEffect(() => {
    if (!picking || !current || !api) return;
    let cancelled = false;
    setProjects(null);
    setLoadError(null);
    api
      .integrationResources(current.id)
      .then((r) => !cancelled && setProjects(r))
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [picking, current?.id, api]);

  const bind = async (project: ResourceInfo | null) => {
    if (!api) return;
    setBusy(true);
    try {
      const updated = await api.setBinding(group.id, { deploy: project && current ? { integrationId: current.id, project: project.id, name: project.name } : null });
      upsertGroup(updated);
      setPicking(false);
    } catch (e) {
      showMessage('保存失败', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unbind = async () => {
    const ok = await confirmAction({ title: '不再跟踪部署？', message: '合并之后群里不会再显示部署进度。', confirmText: '解除', destructive: true });
    if (ok) await bind(null);
  };

  return (
    <View style={styles.root}>
      <SectionLabel>部署平台</SectionLabel>

      {bound && !picking ? (
        <Card>
          <View style={styles.row}>
            <LinkIcon size={18} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {bound.name || bound.project}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {boundIntegration?.typeLabel ?? '部署平台'} · 合并后自动跟踪部署
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={styles.action}>
              <Text style={styles.actionText}>更换</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={unbind} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.danger }]}>解除</Text>
            </Pressable>
          </View>
        </Card>
      ) : !picking ? (
        <Card>
          <Pressable accessibilityRole="button" onPress={() => (platforms.length ? setPicking(true) : router.push('/integrations'))} style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.name}>{platforms.length ? '选择部署项目' : '先连接部署平台'}</Text>
              <Text style={styles.sub}>
                {platforms.length ? '合并修改后，在群里显示部署进度和预览链接' : '在"连接"里添加 Cloudflare、Vercel、Netlify 或 Render'}
              </Text>
            </View>
            <ChevronRightIcon />
          </Pressable>
        </Card>
      ) : (
        <Card>
          {platforms.length > 1 && (
            <View style={styles.chips}>
              {platforms.map((i) => (
                <Pressable key={i.id} accessibilityRole="button" onPress={() => setIntegrationId(i.id)} style={[styles.chip, i.id === current?.id && styles.chipOn]}>
                  <Text style={[styles.chipText, i.id === current?.id && styles.chipTextOn]}>{i.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {loadError ? (
            <Text style={styles.error}>{loadError}</Text>
          ) : projects === null ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : (
            <View>
              {projects.slice(0, 40).map((p) => (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} disabled={busy} onPress={() => bind(p)} style={styles.projectRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.description ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {p.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {!projects.length && <Text style={styles.empty}>这个账号下还没有项目。</Text>}
            </View>
          )}
          <Pressable accessibilityRole="button" onPress={() => setPicking(false)} style={styles.cancel}>
            <Text style={styles.actionText}>取消</Text>
          </Pressable>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider },
  action: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: '#FFFFFF' },
  loading: { padding: 20 },
  error: { padding: 16, fontSize: 13, color: colors.danger },
  projectRow: { paddingHorizontal: 16, paddingVertical: 11, gap: 2, borderTopWidth: 1, borderTopColor: colors.divider },
  empty: { padding: 16, fontSize: 13, color: colors.textSecondary },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.divider },
});
