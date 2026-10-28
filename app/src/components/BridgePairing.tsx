import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTranslation } from '../i18n';
import type { BridgeStatus } from '../protocol';
import { useStore } from '../store';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { CheckIcon } from './Icons';
import { Card, ErrorText, SectionLabel } from './ui';

const TOOL_NAMES: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

/** ABCD-EFGH, easier to read and type than eight letters in a row. */
const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Pairs a work assistant with a computer: shows a one-time code and the command
 * to run there, and follows the connection until the bridge shows up.
 */
export function BridgePairing({ memberId }: { memberId: string }) {
  const { t } = useAppTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { api, settings } = useStore();
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refreshStatus = useCallback(async () => {
    if (!api) return;
    try {
      setStatus(await api.bridgeStatus(memberId));
    } catch {
      // Keep the last known status; the next poll tries again.
    }
  }, [api, memberId]);

  const newCode = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      setCode(await api.createPairing(memberId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, memberId]);

  useEffect(() => {
    newCode();
  }, [newCode]);

  useEffect(() => {
    refreshStatus();
    const t = setInterval(() => {
      setNow(Date.now());
      refreshStatus();
    }, 3000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  const expired = !!code && code.expiresAt < now;
  const server = settings?.serverUrl ?? t('bridge.serverPlaceholder');
  const command = code ? `agenthub-bridge pair ${server} ${code.code}` : '';

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <SectionLabel>{t('bridge.status')}</SectionLabel>
        <Card>
          <View style={styles.statusRow}>
            {status?.online ? (
              <View style={styles.okDot}>
                <CheckIcon size={11} />
              </View>
            ) : (
              <View style={[styles.okDot, { backgroundColor: status?.paired ? colors.warning : colors.border }]} />
            )}
            <View style={styles.statusText}>
              <Text style={styles.statusTitle} numberOfLines={2}>{status?.online ? t('bridge.online') : status?.paired ? t('bridge.pairedOffline') : t('bridge.notPaired')}</Text>
              <Text style={styles.sub}>
                {status?.paired
                  ? status.tools.length
                    ? t('bridge.toolsLine', {
                        name: status.name ?? t('bridge.computer'),
                        tools: status.tools.map((tool) => TOOL_NAMES[tool] ?? tool).join(t('bridge.toolJoiner')),
                      })
                    : (status.name ?? t('bridge.computer'))
                  : t('bridge.followSteps')}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>{status?.paired ? t('bridge.repair') : t('bridge.code')}</SectionLabel>
        <Card>
          <View style={styles.codeBox}>
            {busy && !code ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : code ? (
              <>
                <Text style={[styles.code, expired && styles.codeExpired]} selectable accessibilityLabel={t('bridge.codeA11y', { code: code.code.split('').join(' ') })}>
                  {formatCode(code.code)}
                </Text>
                <Text style={styles.sub}>{expired ? t('bridge.expired') : t('bridge.codeHint')}</Text>
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={newCode} disabled={busy} style={styles.refresh}>
              <Text style={styles.refreshText} numberOfLines={1}>{expired ? t('bridge.refreshExpired') : t('bridge.refresh')}</Text>
            </Pressable>
          </View>
        </Card>
        <ErrorText>{error}</ErrorText>
      </View>

      <View style={styles.section}>
        <SectionLabel>{t('bridge.onComputer')}</SectionLabel>
        <View style={styles.steps}>
          <Text style={styles.step}>{t('bridge.step1')}</Text>
          <Text style={styles.step}>{t('bridge.step2')}</Text>
          <Text style={styles.step}>{t('bridge.step3')}</Text>
          <Text style={styles.command} selectable>
            {command ? `node dist/agenthub-bridge.cjs ${command.replace('agenthub-bridge ', '')}` : '…'}
          </Text>
          <Text style={styles.step}>{t('bridge.step4')}</Text>
          <Text style={styles.command} selectable>
            node dist/agenthub-bridge.cjs run
          </Text>
          <Text style={styles.step}>{t('bridge.step5')}</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { gap: 26 },
  section: { gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  okDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  statusText: { flex: 1, minWidth: 0, gap: 2 },
  statusTitle: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  codeBox: { alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 16 },
  code: { fontSize: 34, fontWeight: '600', letterSpacing: 3, color: colors.text },
  codeExpired: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  refresh: { marginTop: 8, maxWidth: '100%', paddingHorizontal: 16, minHeight: 36, borderRadius: 18, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  refreshText: { flexShrink: 1, fontSize: 13, color: colors.text, textAlign: 'center' },
  steps: { gap: 8, paddingHorizontal: 4 },
  step: { fontSize: 13, lineHeight: 20, color: colors.text },
  command: { fontSize: 12, lineHeight: 18, color: colors.text, backgroundColor: colors.selected, borderRadius: 12, padding: 12, fontFamily: 'monospace' },
});
