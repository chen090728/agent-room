import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { confirmAction, showMessage } from '../dialogs';
import type { GroupSummary, ResourceInfo } from '../protocol';
import { useStore } from '../store';
import { colors } from '../theme';
import { BranchIcon, ChevronRightIcon } from './Icons';
import { Card, SectionLabel } from './ui';

/** Connects a conversation to a repository, so its assistants can read it and propose changes. */
export function RepoBinding({ group }: { group: GroupSummary }) {
  const { api, integrations, refreshIntegrations, upsertGroup } = useStore();
  const bound = group.binding?.repo;
  const [picking, setPicking] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | undefined>(undefined);
  const [repos, setRepos] = useState<ResourceInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshIntegrations().catch(() => {});
  }, [refreshIntegrations]);

  const github = integrations.filter((i) => i.type === 'github');
  const current = github.find((i) => i.id === (integrationId ?? bound?.integrationId)) ?? github[0];
  const boundIntegration = integrations.find((i) => i.id === bound?.integrationId);

  // Load the repositories the chosen connection can see.
  useEffect(() => {
    if (!picking || !current || !api) return;
    let cancelled = false;
    setRepos(null);
    setLoadError(null);
    api
      .integrationResources(current.id)
      .then((r) => !cancelled && setRepos(r))
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [picking, current?.id, api]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (repos ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [repos, query]);
  const typed = query.trim();
  const typedLooksLikeRepo = /^[\w.-]+\/[\w.-]+$/.test(typed) && !filtered.some((r) => r.id === typed);

  const bind = async (repo: string | null) => {
    if (!api) return;
    setBusy(true);
    try {
      const updated = await api.setBinding(group.id, { repo: repo && current ? { integrationId: current.id, repo } : null });
      upsertGroup(updated);
      setPicking(false);
      setQuery('');
    } catch (e) {
      showMessage('保存失败', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unbind = async () => {
    const ok = await confirmAction({ title: '解除绑定？', message: '助手之后就不能再读取这个仓库了。', confirmText: '解除绑定', destructive: true });
    if (ok) await bind(null);
  };

  return (
    <View style={styles.root}>
      <SectionLabel>代码仓库</SectionLabel>

      {bound && !picking ? (
        <Card>
          <View style={styles.boundRow}>
            <BranchIcon size={18} color={colors.icon} />
            <View style={styles.boundText}>
              <Text style={styles.repo} numberOfLines={1}>
                {bound.repo}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {boundIntegration?.name ?? 'GitHub'}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={styles.action}>
              <Text style={styles.actionText}>更换</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={unbind} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.danger }]}>解除绑定</Text>
            </Pressable>
          </View>
        </Card>
      ) : !picking ? (
        <Card>
          <Pressable
            accessibilityRole="button"
            onPress={() => (github.length ? setPicking(true) : router.push({ pathname: '/integrations/new', params: { type: 'github' } }))}
            style={styles.pickRow}
          >
            <View style={styles.boundText}>
              <Text style={styles.repo}>{github.length ? '绑定 GitHub 仓库' : '先连接 GitHub'}</Text>
              <Text style={styles.sub}>
                {github.length ? '让助手读取代码，并通过 PR 提交修改（合并前要你确认）' : '在"连接"里填入访问令牌后，就能把仓库绑定到这个对话'}
              </Text>
            </View>
            <ChevronRightIcon />
          </Pressable>
        </Card>
      ) : (
        <Card>
          {github.length > 1 && (
            <View style={styles.chips}>
              {github.map((i) => (
                <Pressable key={i.id} accessibilityRole="button" onPress={() => setIntegrationId(i.id)} style={[styles.chip, i.id === current?.id && styles.chipOn]}>
                  <Text style={[styles.chipText, i.id === current?.id && styles.chipTextOn]}>{i.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索仓库，或直接输入 所有者/仓库名"
            placeholderTextColor="#A3A3A0"
            accessibilityLabel="搜索仓库"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
          />
          {loadError ? (
            <Text style={styles.error}>{loadError}</Text>
          ) : repos === null ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : (
            <View>
              {typedLooksLikeRepo && (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => bind(typed)} style={styles.repoRow}>
                  <Text style={styles.repoName}>使用 {typed}</Text>
                </Pressable>
              )}
              {filtered.slice(0, 30).map((r) => (
                <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.name} disabled={busy} onPress={() => bind(r.id)} style={styles.repoRow}>
                  <Text style={styles.repoName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  {r.description ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {r.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {!filtered.length && !typedLooksLikeRepo && <Text style={styles.empty}>没有找到仓库。细粒度令牌只能看到你授权过的仓库。</Text>}
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
  boundRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  boundText: { flex: 1, minWidth: 0, gap: 2 },
  repo: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider },
  action: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, color: colors.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingBottom: 0 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: '#FFFFFF' },
  search: { height: 44, marginHorizontal: 12, marginTop: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.selected, fontSize: 14, color: colors.text },
  loading: { padding: 20 },
  error: { padding: 16, fontSize: 13, color: colors.danger },
  repoRow: { paddingHorizontal: 16, paddingVertical: 11, gap: 2, borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 8 },
  repoName: { fontSize: 14, color: colors.text },
  empty: { padding: 16, fontSize: 13, color: colors.textSecondary },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 8 },
});
