import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRightIcon, LockIcon } from '../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel } from '../components/ui';
import { confirmAction, showMessage } from '../dialogs';
import { PLUGIN_HELP, PLUGINS, type PluginInfo } from '../plugins';
import type { IntegrationView, ResourceInfo } from '../protocol';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { SheetHeader, SheetScrollView } from '../sheets';
import { useStore } from '../store';
import { colors } from '../theme';

type View_ = { kind: 'list' } | { kind: 'connect'; plugin: PluginInfo } | { kind: 'bind'; plugin: PluginInfo; integrationId: string };

/**
 * Sheet: the plugins a conversation can use. Unconnected ones take their token
 * right here; connected ones are bound to this conversation (a repository, or
 * a project to follow deployments of).
 */
export function PluginsSheet({ params }: { params: Record<string, string> }) {
  const { groups, integrations, integrationTypes, refreshIntegrations } = useStore();
  const group = groups.find((g) => g.id === params.groupId);
  const [view, setView] = useState<View_>({ kind: 'list' });

  useEffect(() => {
    refreshIntegrations().catch(() => {});
  }, [refreshIntegrations]);

  if (!group) return null;
  const back = () => setView({ kind: 'list' });

  if (view.kind === 'connect') {
    return (
      <ConnectView
        plugin={view.plugin}
        onBack={back}
        onConnected={(integration) => setView({ kind: 'bind', plugin: view.plugin, integrationId: integration.id })}
      />
    );
  }
  if (view.kind === 'bind') {
    return <BindView plugin={view.plugin} groupId={group.id} integrationId={view.integrationId} onBack={back} onDone={back} />;
  }

  const binding = group.binding;
  return (
    <View style={styles.root}>
      <SheetHeader title="插件" />
      <SheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>给「{group.name}」添加插件。令牌加密保存在你的服务器上。</Text>
        <Card>
          {PLUGINS.map((plugin, i) => {
            const connections = integrations.filter((x) => x.type === plugin.type);
            const offered = integrationTypes.some((t) => t.type === plugin.type);
            const bound = plugin.binds === 'repo' ? binding?.repo : binding?.deploy;
            const boundHere = bound && connections.some((c) => c.id === bound.integrationId);
            const needsRepo = plugin.binds === 'deploy' && !binding?.repo;
            const detail = boundHere ? `已绑定：${plugin.binds === 'repo' ? binding!.repo!.repo : binding!.deploy!.name || binding!.deploy!.project}` : null;

            let status = plugin.description;
            let action = '连接';
            if (!offered && integrationTypes.length > 0) {
              status = '这个服务器还不支持它，请先更新服务器';
              action = '';
            } else if (connections.length) {
              status = detail ?? `已连接 · ${connections[0]!.name}`;
              action = needsRepo ? '' : boundHere ? '更换' : '绑定';
              if (needsRepo && !boundHere) status = `已连接 · 先绑定 GitHub 仓库，才能跟踪部署`;
            }
            const press = () => {
              if (!action) return;
              if (connections.length) setView({ kind: 'bind', plugin, integrationId: connections[0]!.id });
              else setView({ kind: 'connect', plugin });
            };
            return (
              <Pressable
                key={plugin.type}
                accessibilityRole="button"
                accessibilityLabel={`${plugin.label}${action ? `，${action}` : ''}`}
                disabled={!action}
                onPress={press}
                style={[styles.row, i > 0 && styles.rowDivider]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.name}>{plugin.label}</Text>
                  <Text style={styles.sub}>{status}</Text>
                </View>
                {action ? (
                  <View style={[styles.pill, boundHere && styles.pillOn]}>
                    <Text style={[styles.pillText, boundHere && styles.pillTextOn]}>{action}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
        <View style={styles.lockNote}>
          <LockIcon />
          <Text style={styles.lockText}>令牌只保存在你的服务器上，这里只显示打码后的样子</Text>
        </View>
      </SheetScrollView>
    </View>
  );
}

function ConnectView({ plugin, onBack, onConnected }: { plugin: PluginInfo; onBack(): void; onConnected(integration: IntegrationView): void }) {
  const { api, integrationTypes, refreshIntegrations } = useStore();
  const info = integrationTypes.find((t) => t.type === plugin.type);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !info || info.fields.some((f) => f.required && !config[f.key]?.trim());

  const save = async () => {
    if (!api || !info) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createIntegration({ type: info.type, config });
      await refreshIntegrations();
      onConnected(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoider style={styles.root}>
      <SheetHeader title={`连接 ${plugin.label}`} onBack={onBack} />
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{info?.description ?? plugin.description}</Text>
        {PLUGIN_HELP[plugin.type] && (
          <View style={styles.help}>
            {PLUGIN_HELP[plugin.type]!.map((line) => (
              <Text key={line} style={styles.helpLine}>
                {line}
              </Text>
            ))}
          </View>
        )}
        {info && (
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
            <View style={styles.lockNote}>
              <LockIcon />
              <Text style={styles.lockText}>令牌加密保存在你的服务器上</Text>
            </View>
          </View>
        )}
        {!info && (integrationTypes.length ? <Text style={styles.intro}>这个服务器还不支持 {plugin.label}。请先更新服务器（重新部署最新版本）。</Text> : <ActivityIndicator color={colors.textSecondary} />)}
      </SheetScrollView>
      <View style={styles.footer}>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton title="验证并保存" onPress={save} disabled={missing} busy={busy} />
      </View>
    </KeyboardAvoider>
  );
}

function BindView({ plugin, groupId, integrationId, onBack, onDone }: { plugin: PluginInfo; groupId: string; integrationId: string; onBack(): void; onDone(): void }) {
  const { api, integrations, groups, refreshIntegrations, upsertGroup } = useStore();
  const connections = integrations.filter((i) => i.type === plugin.type);
  const [currentId, setCurrentId] = useState(integrationId);
  const current = connections.find((c) => c.id === currentId) ?? connections[0];
  const group = groups.find((g) => g.id === groupId);
  const [resources, setResources] = useState<ResourceInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!current || !api) return;
    let cancelled = false;
    setResources(null);
    setLoadError(null);
    api
      .integrationResources(current.id)
      .then((r) => !cancelled && setResources(r))
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [current?.id, api]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (resources ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [resources, query]);
  const typed = query.trim();
  const typedLooksLikeRepo = plugin.binds === 'repo' && /^[\w.-]+\/[\w.-]+$/.test(typed) && !filtered.some((r) => r.id === typed);

  const bind = async (resource: ResourceInfo | { id: string; name: string }) => {
    if (!api || !current) return;
    setBusy(true);
    try {
      const updated = await api.setBinding(groupId, {
        [plugin.binds]: plugin.binds === 'repo' ? { integrationId: current.id, repo: resource.id } : { integrationId: current.id, project: resource.id, name: resource.name },
      });
      upsertGroup(updated);
      onDone();
    } catch (e) {
      showMessage('保存失败', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!api || !current) return;
    const ok = await confirmAction({
      title: `断开「${current.name}」？`,
      message: '会同时解除所有用到它的对话的绑定，服务器上保存的令牌也会被删掉。',
      confirmText: '断开',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteIntegration(current.id);
      await refreshIntegrations();
      onBack();
    } catch (e) {
      showMessage('断开失败', (e as Error).message);
    }
  };

  if (!current) return null;
  const bound = plugin.binds === 'repo' ? group?.binding?.repo : group?.binding?.deploy;

  return (
    <KeyboardAvoider style={styles.root}>
      <SheetHeader title={plugin.binds === 'repo' ? '选择仓库' : '选择部署项目'} onBack={onBack} />
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {connections.length > 1 && (
          <View style={styles.chips}>
            {connections.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => setCurrentId(c.id)} style={[styles.chip, c.id === current.id && styles.chipOn]}>
                <Text style={[styles.chipText, c.id === current.id && styles.chipTextOn]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.intro}>
          {plugin.binds === 'repo' ? '绑定后，这个对话里的助手可以读取这个仓库，并通过 PR 提交修改。' : '绑定后，你在聊天里点"同意合并"，群里会显示这个项目的部署进度和预览链接。'}
        </Text>
        {plugin.binds === 'repo' && (
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
        )}
        <Card>
          {loadError ? (
            <Text style={styles.error}>{loadError}</Text>
          ) : resources === null ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : (
            <View>
              {typedLooksLikeRepo && (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => bind({ id: typed, name: typed })} style={styles.resourceRow}>
                  <Text style={styles.name}>使用 {typed}</Text>
                </Pressable>
              )}
              {filtered.slice(0, 40).map((r, i) => {
                const on = bound && ('repo' in bound ? bound.repo === r.id : bound.project === r.id);
                return (
                  <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.name} disabled={busy} onPress={() => bind(r)} style={[styles.resourceRow, (i > 0 || typedLooksLikeRepo) && styles.rowDivider]}>
                    <View style={styles.rowText}>
                      <Text style={styles.name} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.description ? (
                        <Text style={styles.sub} numberOfLines={1}>
                          {r.description}
                        </Text>
                      ) : null}
                    </View>
                    {on ? <Text style={styles.current}>当前</Text> : <ChevronRightIcon />}
                  </Pressable>
                );
              })}
              {!filtered.length && !typedLooksLikeRepo && (
                <Text style={styles.empty}>{plugin.binds === 'repo' ? '没有找到仓库。细粒度令牌只能看到你授权过的仓库。' : '这个账号下还没有项目。'}</Text>
              )}
            </View>
          )}
        </Card>
        <Pressable accessibilityRole="button" onPress={disconnect} style={styles.disconnect}>
          <Text style={styles.disconnectText}>断开「{current.name}」</Text>
        </Pressable>
      </SheetScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30, gap: 16 },
  intro: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingHorizontal: 4 },
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  pill: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.text },
  pillText: { fontSize: 13, color: colors.text },
  pillTextOn: { color: '#FFFFFF' },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  lockText: { fontSize: 12, color: colors.textSecondary },
  help: { gap: 6, padding: 14, borderRadius: 16, backgroundColor: colors.selected },
  helpLine: { fontSize: 12.5, lineHeight: 19, color: colors.text },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: '#FFFFFF' },
  search: { height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.selected, fontSize: 14, color: colors.text },
  loading: { padding: 20 },
  error: { padding: 16, fontSize: 13, color: colors.danger },
  resourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  current: { fontSize: 12, color: colors.textSecondary },
  empty: { padding: 16, fontSize: 13, color: colors.textSecondary },
  disconnect: { alignItems: 'center', justifyContent: 'center', height: 44 },
  disconnectText: { fontSize: 13, color: colors.danger },
});
