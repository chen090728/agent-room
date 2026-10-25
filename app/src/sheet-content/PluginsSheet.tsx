import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRightIcon, LockIcon } from '../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel } from '../components/ui';
import { confirmAction, showMessage } from '../dialogs';
import { useAppTranslation } from '../i18n';
import { pluginHelp, plugins, type PluginInfo } from '../plugins';
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
  const { t } = useAppTranslation();
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
      <SheetHeader title={t('plugins.title')} />
      <SheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('plugins.intro', { name: group.name })}</Text>
        <Card>
          {plugins().map((plugin, i) => {
            const connections = integrations.filter((x) => x.type === plugin.type);
            const offered = integrationTypes.some((item) => item.type === plugin.type);
            const bound = plugin.binds === 'repo' ? binding?.repo : binding?.deploy;
            const boundHere = bound && connections.some((c) => c.id === bound.integrationId);
            const needsRepo = plugin.binds === 'deploy' && !binding?.repo;
            const target = boundHere ? (plugin.binds === 'repo' ? binding!.repo!.repo : binding!.deploy!.name || binding!.deploy!.project) : '';
            const detail = boundHere ? t('plugins.bound', { target }) : null;

            let status = plugin.description;
            let action = t('plugins.connect');
            if (!offered && integrationTypes.length > 0) {
              status = t('plugins.unsupported');
              action = '';
            } else if (connections.length) {
              status = detail ?? t('plugins.connected', { name: connections[0]!.name });
              action = needsRepo ? '' : boundHere ? t('common.change') : t('plugins.bind');
              if (needsRepo && !boundHere) status = t('plugins.needsRepo');
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
                accessibilityLabel={action ? t('plugins.rowA11y', { name: plugin.label, action }) : plugin.label}
                disabled={!action}
                onPress={press}
                style={[styles.row, i > 0 && styles.rowDivider]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>{plugin.label}</Text>
                  <Text style={styles.sub}>{status}</Text>
                </View>
                {action ? (
                  <View style={[styles.pill, boundHere && styles.pillOn]}>
                    <Text style={[styles.pillText, boundHere && styles.pillTextOn]} numberOfLines={1}>{action}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
        <View style={styles.lockNote}>
          <LockIcon />
          <Text style={styles.lockText}>{t('plugins.maskedNote')}</Text>
        </View>
      </SheetScrollView>
    </View>
  );
}

function ConnectView({ plugin, onBack, onConnected }: { plugin: PluginInfo; onBack(): void; onConnected(integration: IntegrationView): void }) {
  const { t } = useAppTranslation();
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
      <SheetHeader title={t('plugins.connectTitle', { name: plugin.label })} onBack={onBack} />
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{info?.description ?? plugin.description}</Text>
        {pluginHelp(plugin.type) && (
          <View style={styles.help}>
            {pluginHelp(plugin.type)!.map((line) => (
              <Text key={line} style={styles.helpLine}>
                {line}
              </Text>
            ))}
          </View>
        )}
        {info && (
          <View style={styles.section}>
            <SectionLabel>{t('plugins.info')}</SectionLabel>
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
              <Text style={styles.lockText}>{t('plugins.encryptedNote')}</Text>
            </View>
          </View>
        )}
        {!info && (integrationTypes.length ? <Text style={styles.intro}>{t('plugins.unsupportedNamed', { name: plugin.label })}</Text> : <ActivityIndicator color={colors.textSecondary} />)}
      </SheetScrollView>
      <View style={styles.footer}>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton title={t('plugins.verify')} onPress={save} disabled={missing} busy={busy} />
      </View>
    </KeyboardAvoider>
  );
}

function BindView({ plugin, groupId, integrationId, onBack, onDone }: { plugin: PluginInfo; groupId: string; integrationId: string; onBack(): void; onDone(): void }) {
  const { t } = useAppTranslation();
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
      showMessage(t('plugins.saveFailed'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!api || !current) return;
    const ok = await confirmAction({
      title: t('plugins.disconnectTitle', { name: current.name }),
      message: t('plugins.disconnectMessage'),
      confirmText: t('common.disconnect'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteIntegration(current.id);
      await refreshIntegrations();
      onBack();
    } catch (e) {
      showMessage(t('plugins.disconnectFailed'), (e as Error).message);
    }
  };

  if (!current) return null;
  const bound = plugin.binds === 'repo' ? group?.binding?.repo : group?.binding?.deploy;

  return (
    <KeyboardAvoider style={styles.root}>
      <SheetHeader title={plugin.binds === 'repo' ? t('plugins.pickRepo') : t('plugins.pickProject')} onBack={onBack} />
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
          {plugin.binds === 'repo' ? t('plugins.repoHint') : t('plugins.deployHint')}
        </Text>
        {plugin.binds === 'repo' && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('plugins.searchPlaceholder')}
            placeholderTextColor="#A3A3A0"
            accessibilityLabel={t('plugins.searchA11y')}
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
                  <Text style={styles.name} numberOfLines={1}>{t('plugins.useTyped', { name: typed })}</Text>
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
                    {on ? <Text style={styles.current}>{t('plugins.current')}</Text> : <ChevronRightIcon />}
                  </Pressable>
                );
              })}
              {!filtered.length && !typedLooksLikeRepo && (
                <Text style={styles.empty}>{plugin.binds === 'repo' ? t('plugins.emptyRepos') : t('plugins.emptyProjects')}</Text>
              )}
            </View>
          )}
        </Card>
        <Pressable accessibilityRole="button" onPress={disconnect} style={styles.disconnect}>
          <Text style={styles.disconnectText}>{t('plugins.disconnectNamed', { name: current.name })}</Text>
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
  pill: { flexShrink: 0, maxWidth: 108, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.text },
  pillText: { fontSize: 13, color: colors.text },
  pillTextOn: { color: '#FFFFFF' },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  lockText: { flexShrink: 1, fontSize: 12, color: colors.textSecondary },
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
